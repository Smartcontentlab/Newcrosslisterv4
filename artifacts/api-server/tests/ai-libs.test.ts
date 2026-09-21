import assert from "node:assert/strict";
import { nimChat, resetNimState, NimError, cleanModelText, extractJsonObject } from "../src/lib/nim";
import { finishCopy, templateCopy, generatePlatformCopy, cleanHashtags, guardBody, allowedStatusTags, type CopyFacts } from "../src/lib/listing-copy";
import { buildQuery, summarize, findComps, resetCompsCache, compsEstimate } from "../src/lib/comps";
import { normalizePhotoFacts, mergePhotoFacts, readPhotos } from "../src/lib/photo-read";
import { relevantTrends } from "../src/lib/platform-playbooks";

const realFetch = globalThis.fetch;
let calls: Array<{ url: string; body?: any }> = [];
type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const mockFetch = (handler: Handler) => { calls = []; globalThis.fetch = (async (input: any, init?: RequestInit) => { const url = String(input); calls.push({ url, body: (() => { try { return init?.body ? JSON.parse(String(init.body)) : undefined; } catch { return undefined; } })() }); return handler(url, init); }) as any; };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const chat = (content: string) => json({ choices: [{ message: { content } }] });
const models = (ids: string[]) => json({ data: ids.map((id) => ({ id })) });
let passed = 0;
const test = async (name: string, fn: () => Promise<void> | void) => { try { resetNimState(); resetCompsCache(); await fn(); passed++; console.log("ok  -", name); } catch (e) { console.error("FAIL -", name, "\n", e); process.exitCode = 1; } };

process.env.NVIDIA_NIM_API_KEY = "test-key-not-real";

await test("nim: retired configured model is ignored, live model used", async () => {
  process.env.NVIDIA_NIM_MODEL = "meta/llama-3.3-70b-instruct";
  mockFetch((url, init) => url.endsWith("/models") ? models(["nvidia/nemotron-3.5-lightning-30b-a3b", "google/gemma-4-31b-it"]) : chat("hello"));
  const r = await nimChat({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(r.text, "hello");
  const used = calls.filter((c) => c.body).map((c) => c.body.model);
  assert.ok(!used.includes("meta/llama-3.3-70b-instruct"), "must not send retired model");
  assert.equal(used[0], "google/gemma-4-31b-it");
  delete process.env.NVIDIA_NIM_MODEL;
});
await test("nim: configured live model goes first", async () => {
  process.env.NVIDIA_NIM_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
  mockFetch((url) => url.endsWith("/models") ? models(["nvidia/nemotron-3.5-lightning-30b-a3b", "google/gemma-4-31b-it"]) : chat("x"));
  await nimChat({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(calls.find((c) => c.body)!.body.model, "nvidia/nemotron-3.5-lightning-30b-a3b");
  delete process.env.NVIDIA_NIM_MODEL;
});
await test("nim: falls through 404 then 429 to a working model, strips think", async () => {
  let n = 0;
  mockFetch((url) => { if (url.endsWith("/models")) return models(["mistralai/mistral-large-2-instruct", "nvidia/llama-3.1-nemotron-70b-instruct", "google/gemma-4-31b-it"]); n++; if (n === 1) return json({ detail: "not found" }, 404); if (n === 2) return json({}, 429); return chat("<think>plan</think>{\"a\":1}"); });
  const r = await nimChat({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(r.text, '{"a":1}'); assert.equal(r.model, "google/gemma-4-31b-it");
});
await test("nim: models list unavailable still works with defaults", async () => {
  mockFetch((url) => url.endsWith("/models") ? json({}, 500) : chat("ok"));
  assert.equal((await nimChat({ messages: [{ role: "user", content: "hi" }] })).text, "ok");
});
await test("nim: auth failure is immediate and readable, key never in message", async () => {
  mockFetch((url) => url.endsWith("/models") ? models(["google/gemma-4-31b-it"]) : json({}, 401));
  await assert.rejects(nimChat({ messages: [{ role: "user", content: "hi" }] }), (e: any) => e instanceof NimError && e.code === "auth" && !e.message.includes("test-key-not-real"));
});
await test("nim: all models fail -> readable reason", async () => {
  mockFetch((url) => url.endsWith("/models") ? models(["google/gemma-4-31b-it", "mistralai/mistral-large"]) : json({ error: "overloaded" }, 503));
  await assert.rejects(nimChat({ messages: [{ role: "user", content: "hi" }] }), (e: any) => e instanceof NimError && /could not answer/.test(e.message) && /503/.test(e.message));
});
await test("nim: missing key", async () => {
  const k = process.env.NVIDIA_NIM_API_KEY; delete process.env.NVIDIA_NIM_API_KEY;
  await assert.rejects(nimChat({ messages: [] }), (e: any) => e.code === "not_configured");
  process.env.NVIDIA_NIM_API_KEY = k;
});
await test("nim: helpers", () => {
  assert.equal(cleanModelText("<think>x</think> hi"), "hi");
  assert.deepEqual(extractJsonObject("Sure!\n```json\n{\"a\":1,}\n```"), { a: 1 });
});

const jeans: CopyFacts = { title: "501 Straight Jeans", brand: "Levi's", condition: "good", size: "30 x 32", color: "medium wash blue", measurements: "Waist: 15 in flat · Inseam: 31 in", material: "100% cotton denim", flaws: "small fade at the left knee", description: "1990s pair" };

await test("copy: guard removes unsupported claims and numbers", () => {
  const g = guardBody("Great jeans. Smoke-free home. Inseam is 33 inches. Waist 15 in flat. Ships next day.", jeans);
  assert.ok(!/smoke/i.test(g.body)); assert.ok(!/33/.test(g.body)); assert.ok(!/next day/i.test(g.body)); assert.ok(/15 in flat/.test(g.body)); assert.ok(g.warnings.length >= 3);
});
await test("copy: hashtags — no brand stuffing, no unsupported status tags", () => {
  const tags = cleanHashtags(["#NWT", "nike", "Levis", "vintage", "Y2K Style", "vintage", "a"], "poshmark", jeans);
  assert.ok(!tags.includes("nwt")); assert.ok(!tags.includes("nike")); assert.ok(tags.includes("levis")); assert.ok(tags.includes("y2kstyle")); assert.equal(tags.filter((t) => t === "vintage").length, 1);
});
await test("copy: NWT allowed only with evidence, and auto-added on poshmark", () => {
  const nwt: CopyFacts = { ...jeans, condition: "new", description: "new with tags" };
  assert.ok(allowedStatusTags(nwt).has("nwt")); assert.ok(!allowedStatusTags({ ...jeans, condition: "new", description: "" }).has("nwt"));
  assert.ok(cleanHashtags(["summer"], "poshmark", nwt).includes("nwt"));
  assert.ok(!cleanHashtags(["nwt", "summer"], "depop", { ...nwt, description: "" }).includes("nwt"));
});
await test("copy: finishCopy composes per platform and enforces limits", () => {
  const raw = { title: "LEVI'S 501 STRAIGHT LEG JEANS SIZE 30X32 MEDIUM WASH VINTAGE 90S DENIM", body: "Classic 90s 501s.\n\n• Brand: Levi's\n• Waist: 15 in flat\n\nCondition: good, small fade at the left knee.\n#vintage #denim", hashtags: ["vintage", "denim", "levis", "gucci"] };
  const p = finishCopy("poshmark", jeans, raw, "m", [])!;
  assert.ok(p.title.length <= 80 && !/^[A-Z\s\d'×X]+$/.test(p.title), p.title);
  assert.ok(p.description.endsWith("#vintage #denim #levis")); assert.ok(!p.hashtags.includes("gucci"));
  assert.ok(!/\n#vintage #denim\n/.test(p.description.split("\n\n#")[0]));
  const d = finishCopy("depop", jeans, { ...raw, title: "levi's 501 straight jeans 30x32 y2k" }, "m", [])!;
  assert.ok(d.description.startsWith("levi's 501 straight jeans 30x32 y2k\n\n")); assert.ok(d.limits.description === 1000);
  const long = finishCopy("mercari", jeans, { title: "t", body: Array.from({ length: 80 }, (_, i) => `Line ${i} about the jeans and their condition.`).join("\n"), hashtags: [] }, "m", [])!;
  assert.ok(long.description.length <= 1000); assert.ok(long.warnings.includes("Shortened to fit the length limit."));
  assert.equal(finishCopy("mercari", jeans, { title: "", body: "" }, "m", []), null);
});
await test("copy: templates exist for every platform and respect the guard", () => {
  for (const p of ["poshmark", "depop", "mercari"] as const) {
    const t = templateCopy(p, jeans, "AI down");
    assert.equal(t.source, "template"); assert.equal(t.reason, "AI down"); assert.ok(t.title.length > 5 && t.title.length <= 80); assert.ok(t.description.includes("15 in flat"), p);
    assert.ok(t.description.length <= t.limits.description);
  }
  assert.ok(templateCopy("mercari", jeans).hashtags.length <= 3); assert.ok(templateCopy("depop", jeans).hashtags.length <= 5);
});
await test("copy: depop trend words only when item fits", () => {
  assert.equal(relevantTrends("depop", "plain wool sweater").length, 0);
  assert.ok(relevantTrends("depop", "black leather riding boots square toe").some((t) => t.source.includes("riding boots")));
  assert.equal(relevantTrends("poshmark", "riding boots").length, 0);
});
await test("copy: generatePlatformCopy sends a platform-specific prompt with matching trends only", async () => {
  mockFetch((url, init) => {
    if (url.endsWith("/models")) return models(["google/gemma-4-31b-it"]);
    return chat(JSON.stringify({ title: "levi's 501 jeans", body: "90s 501s in a great wash.\nsize 30 x 32", hashtags: ["y2k", "vintage"] }));
  });
  const boots = { ...jeans, title: "Black leather riding boots", brand: "", measurements: "", condition: "fair" };
  const c = await generatePlatformCopy("depop", boots);
  assert.equal(c.source, "ai"); assert.ok(c.trendsUsed.some((s) => s.includes("riding boots")));
  const body = calls.find((x) => x.body)!.body; const sys = body.messages[0].content, user = body.messages[1].content;
  assert.ok(/Depop only/.test(sys) && /Gen Z/.test(sys)); assert.ok(/riding boots/i.test(user)); assert.ok(/Do not use status hashtags/.test(user));
  const posh = await generatePlatformCopy("poshmark", jeans); const psys = calls.filter((x) => x.body).pop()!.body.messages[0].content;
  assert.ok(/Poshmark only/.test(psys) && /friend/.test(psys) && !/Gen Z/.test(psys)); assert.equal(posh.source, "ai");
});
await test("copy: AI failure -> labelled template with the real reason", async () => {
  mockFetch((url) => url.endsWith("/models") ? models(["google/gemma-4-31b-it"]) : json({}, 503));
  const c = await generatePlatformCopy("mercari", jeans);
  assert.equal(c.source, "template"); assert.match(c.reason!, /could not answer/);
});
await test("copy: unreadable JSON gets one retry", async () => {
  let n = 0;
  mockFetch((url) => { if (url.endsWith("/models")) return models(["google/gemma-4-31b-it"]); n++; return n === 1 ? chat("Here you go! no json") : chat('{"title":"levi 501 jeans","body":"good jeans\\nsize 30 x 32","hashtags":["denim"]}'); });
  const c = await generatePlatformCopy("mercari", jeans); assert.equal(c.source, "ai"); assert.equal(n, 2);
});

await test("comps: query building", () => {
  assert.equal(buildQuery({ title: "Vintage 501 Straight Jeans size 30", brand: "Levi's" }), "Levi's 501 Straight Jeans 30");
});
await test("comps: summarize trims junk and outliers, needs 3", () => {
  const mk = (t: string, price: number, d = "2026-09-01") => ({ title: t, price, endedAt: d });
  const r = summarize([mk("A", 40), mk("B", 45), mk("C", 50), mk("lot of 10 jeans", 400), mk("D", 900), mk("E", 55)], { source: "sold", provider: "soldcomps", query: "q", windowDays: 90 })!;
  assert.equal(r.count, 4); assert.equal(r.median, 47.5); assert.ok(r.max <= 55);
  assert.equal(summarize([mk("A", 1), mk("B", 2)], { source: "sold", provider: "soldcomps", query: "q", windowDays: 90 }), null);
});
await test("comps: SoldComps success -> deterministic estimate, cached, bearer sent", async () => {
  process.env.SOLDCOMPS_API_KEY = "sc_test";
  mockFetch((url, init) => json({ items: [30, 34, 36, 38, 40, 41, 44].map((p, i) => ({ title: `Levi's 501 jeans ${i}`, soldPrice: String(p), soldCurrency: "USD", endedAt: `2026-09-0${i + 1}`, url: `https://ebay.com/itm/${i}` })) }));
  const o = await findComps({ title: "501 Jeans", brand: "Levi's" });
  assert.equal(o.result!.source, "sold"); assert.equal(o.result!.median, 38);
  assert.ok((calls[0].url).includes("api.sold-comps.com/v1/scrape?keyword=")); 
  const e = compsEstimate(o.result!); assert.equal(e.suggestedPrice, 38); assert.equal(e.confidence, "medium"); assert.match(e.reasoning, /sold prices/);
  const before = calls.length; await findComps({ title: "501 Jeans", brand: "Levi's" }); assert.equal(calls.length, before, "cached");
  assert.equal(o.result!.samples[0].endedAt, "2026-09-07");
  delete process.env.SOLDCOMPS_API_KEY;
});
await test("comps: falls back to eBay Browse asking prices, labelled", async () => {
  process.env.EBAY_CLIENT_ID = "id"; process.env.EBAY_CLIENT_SECRET = "secret";
  mockFetch((url) => url.includes("oauth2/token") ? json({ access_token: "tok", expires_in: 7200 }) : json({ itemSummaries: [50, 55, 60, 65, 70].map((p, i) => ({ title: `Jacket ${i}`, price: { value: String(p), currency: "USD" }, itemWebUrl: "https://ebay.com/x" })) }));
  const o = await findComps({ title: "Green Jacket" });
  assert.equal(o.result!.source, "active"); assert.match(compsEstimate(o.result!).reasoning, /asking prices/); assert.match(o.note, /not sold prices/);
  delete process.env.EBAY_CLIENT_ID; delete process.env.EBAY_CLIENT_SECRET;
});
await test("comps: provider failure is reported, not thrown, and not cached; no keys explains itself", async () => {
  process.env.SOLDCOMPS_API_KEY = "sc_test";
  mockFetch(() => json({}, 429));
  const o = await findComps({ title: "Something Rare" }); assert.equal(o.result, null); assert.match(o.note, /limit reached/); assert.match(o.searchUrl, /LH_Sold=1/);
  delete process.env.SOLDCOMPS_API_KEY;
  const o2 = await findComps({ title: "Other Thing" }); assert.match(o2.note, /No comps provider is connected/);
});

await test("photo: normalize + merge", () => {
  const a = normalizePhotoFacts({ title: "Black hoodie", brand: "", category: "clothing", color: "black", flaws: ["pilling"], unsure: ["brand", "size"] });
  const b = normalizePhotoFacts({ title: "Nike black hoodie", brand: "Nike", category: "Weird", size: "M", flaws: ["Pilling", "stain on cuff"], unsure: ["material"] });
  assert.equal(a.category, "Clothing"); assert.equal(b.category, "");
  const m = mergePhotoFacts([a, b]);
  assert.equal(m.title, "Black hoodie"); assert.equal(m.brand, "Nike"); assert.equal(m.size, "M"); assert.equal(m.category, "Clothing");
  assert.deepEqual(m.flaws, ["pilling", "stain on cuff"]); assert.deepEqual(m.unsure, ["material"]);
});
await test("photo: readPhotos sends one image per request, vision model, merges; partial failure ok", async () => {
  let n = 0;
  mockFetch((url) => { if (url.endsWith("/models")) return models(["meta/llama-3.2-11b-vision-instruct", "google/gemma-4-31b-it"]); n++; if (n === 2) return json({}, 500); return chat(JSON.stringify({ title: `Item ${n}`, brand: n === 3 ? "Zara" : "", category: "Clothing", color: "red", flaws: [], unsure: [] })); });
  const img = "data:image/jpeg;base64,AAAA";
  const r = await readPhotos([img, img, img], { title: "Red top" });
  const chats = calls.filter((c) => c.body);
  assert.ok(chats.every((c) => Array.isArray(c.body.messages[1].content) && c.body.messages[1].content.filter((p: any) => p.type === "image_url").length === 1));
  assert.ok(chats.some((c) => c.body.model === "meta/llama-3.2-11b-vision-instruct")); assert.ok(r.photosRead >= 2); assert.equal(r.facts.color, "red");
});

globalThis.fetch = realFetch;
console.log(`\n${passed} tests passed`);
