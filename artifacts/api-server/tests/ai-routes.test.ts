import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import workflow from "../src/routes/workflow";
import ai from "../src/routes/ai";
import { resetNimState } from "../src/lib/nim";
import { resetCompsCache } from "../src/lib/comps";

process.env.NVIDIA_NIM_API_KEY = "test-key-not-real";
const app = express();
app.use(express.json({ limit: "3mb" }));
app.use((_req, res, next) => { res.locals.authUser = { id: "u1", email: "a@b.c" }; next(); });
app.use("/api", workflow); app.use("/api", ai);
const server = app.listen(0);
const port = (server.address() as any).port;
const post = (path: string, body: unknown) => new Promise<{ status: number; json: any }>((resolve, reject) => {
  const data = JSON.stringify(body);
  const req = http.request({ port, path, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (res) => { let s = ""; res.on("data", (c) => (s += c)); res.on("end", () => resolve({ status: res.statusCode!, json: s ? JSON.parse(s) : null })); });
  req.on("error", reject); req.write(data); req.end();
});
const realFetch = globalThis.fetch;
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });
const nim = (h: (body: any) => Response) => { globalThis.fetch = (async (input: any, init?: any) => { const url = String(input); if (url.endsWith("/models")) return json({ data: [{ id: "google/gemma-4-31b-it" }, { id: "meta/llama-3.2-11b-vision-instruct" }] }); return h(JSON.parse(init.body)); }) as any; };
(async function main(){
let ok = 0; const t = async (n: string, f: () => Promise<void>) => { try { resetNimState(); resetCompsCache(); await f(); ok++; console.log("ok  -", n); } catch (e) { console.error("FAIL -", n, e); process.exitCode = 1; } };

await t("listing-copy: 400 without title", async () => { assert.equal((await post("/api/workflow/listing-copy", { title: "" })).status, 400); });
await t("listing-copy: three platforms, AI ok", async () => {
  nim((b) => json({ choices: [{ message: { content: JSON.stringify({ title: "Levi's 501 Jeans 30x32", body: "Classic 501s.\n• Size: 30 x 32", hashtags: ["denim", "levis"] }) } }] }));
  const r = await post("/api/workflow/listing-copy", { title: "501 jeans", brand: "Levi's", size: "30 x 32", condition: "good" });
  assert.equal(r.status, 200); assert.deepEqual(Object.keys(r.json.copies).sort(), ["depop", "mercari", "poshmark"]); assert.equal(r.json.aiProblem, null);
  assert.equal(r.json.copies.depop.description.split("\n")[0], "Levi's 501 Jeans 30x32"); assert.ok(r.json.playbooks.poshmark.sources.length >= 3); assert.equal(r.json.trendsAsOf, "2026-09-21");
});
await t("listing-copy: AI down -> 200 with templates + aiProblem", async () => {
  nim(() => json({}, 503));
  const r = await post("/api/workflow/listing-copy", { title: "501 jeans", brand: "Levi's", condition: "good", platforms: ["mercari"] });
  assert.equal(r.status, 200); assert.equal(r.json.copies.mercari.source, "template"); assert.match(r.json.aiProblem, /could not answer/);
});
await t("ai-assist: title focus ok; failure is 502 with reason (no fake fill)", async () => {
  nim(() => json({ choices: [{ message: { content: '{"title":"Levi\'s 501 Straight Jeans 30x32","tags":["levis"],"description":"","confidence":"ok"}' } }] }));
  const a = await post("/api/workflow/ai-assist", { title: "501 jeans", focus: "title" });
  assert.equal(a.status, 200); assert.equal(a.json.title, "Levi's 501 Straight Jeans 30x32"); assert.equal(a.json.usedFallback, undefined);
  nim(() => json({}, 503)); resetNimState();
  const b = await post("/api/workflow/ai-assist", { title: "501 jeans" });
  assert.equal(b.status, 502); assert.match(b.json.error, /could not answer/);
  assert.equal((await post("/api/workflow/ai-assist", {})).status, 400);
});
await t("photo-read: validates images; returns merged facts", async () => {
  assert.equal((await post("/api/workflow/photo-read", { photos: [] })).status, 400);
  assert.equal((await post("/api/workflow/photo-read", { photos: ["https://evil.example/x.jpg"] })).status, 400);
  assert.equal((await post("/api/workflow/photo-read", { photos: ["data:image/jpeg;base64," + "A".repeat(170_100)] })).status, 400);
  nim((b) => { assert.ok(b.messages[1].content.some((p: any) => p.type === "image_url")); return json({ choices: [{ message: { content: '{"title":"Red cotton tee","brand":"","category":"Clothing","color":"red","flaws":[],"unsure":["brand"]}' } }] }); });
  const r = await post("/api/workflow/photo-read", { photos: ["data:image/jpeg;base64,AAAA", "data:image/png;base64,BBBB"] });
  assert.equal(r.status, 200); assert.equal(r.json.title, "Red cotton tee"); assert.equal(r.json.photosRead, 2); assert.deepEqual(r.json.unsure, ["brand"]);
  nim(() => json({}, 503)); resetNimState();
  const f = await post("/api/workflow/photo-read", { photos: ["data:image/jpeg;base64,AAAA"] }); assert.equal(f.status, 502);
});
await t("missing NIM key -> 503 readable", async () => {
  const k = process.env.NVIDIA_NIM_API_KEY; delete process.env.NVIDIA_NIM_API_KEY;
  const r = await post("/api/workflow/photo-read", { photos: ["data:image/jpeg;base64,AAAA"] }); assert.equal(r.status, 503); assert.match(r.json.error, /NVIDIA_NIM_API_KEY/);
  process.env.NVIDIA_NIM_API_KEY = k;
});
console.log(`${ok} route tests passed`); globalThis.fetch = realFetch; server.close();

})();
