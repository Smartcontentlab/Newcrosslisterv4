import { extractJsonObject, nimChat, nimProblem } from "./nim";
import { PLAYBOOKS, PLATFORMS, relevantTrends, seasonWords, WATCHED_BRANDS, TRENDS_AS_OF, type Platform } from "./platform-playbooks";

/**
 * Per-platform listing copy: title, description and hashtags written to each marketplace's own conventions
 * (see platform-playbooks.ts for the research behind them).
 *
 * Two safety nets sit around the AI:
 *   - a truth guard that removes claims and numbers the seller never gave, and hashtags that are brand-stuffing;
 *   - a deterministic template used when the AI cannot answer, clearly labelled as a template (source: "template").
 */

export type CopyFacts = {
  title: string; description?: string; brand?: string; model?: string; category?: string; subcategory?: string; department?: string;
  size?: string; color?: string; secondaryColor?: string; condition: string; measurements?: string; material?: string; pattern?: string;
  fit?: string; style?: string; flaws?: string; includedItems?: string; authenticity?: string; bundleInfo?: string; originalPrice?: string; tags?: string[];
};

export type PlatformCopy = {
  platform: Platform;
  title: string;
  description: string;
  hashtags: string[];
  warnings: string[];
  hints: string[];
  source: "ai" | "template";
  model: string | null;
  /** Why the template was used instead of the AI. Only set when source is "template". */
  reason?: string;
  limits: { title: number; description: number; titleVerified: boolean; descriptionVerified: boolean };
  trendsUsed: string[];
};

const CONDITION_LABEL: Record<string, string> = { new: "New", like_new: "Like new", good: "Good used condition", fair: "Fair, visible wear", poor: "Well worn" };
const clean = (value?: string | null) => (value ?? "").replace(/\s+/g, " ").trim();
const factList = (facts: CopyFacts) => [
  ["Item", facts.title], ["Brand", facts.brand], ["Style / model", facts.model], ["Category", [facts.category, facts.subcategory].filter(Boolean).join(" / ")], ["Department", facts.department],
  ["Size", facts.size], ["Color", [facts.color, facts.secondaryColor].filter(Boolean).join(", ")], ["Material", facts.material], ["Pattern", facts.pattern], ["Fit", facts.fit], ["Style notes", facts.style],
  ["Condition", CONDITION_LABEL[facts.condition] ?? facts.condition], ["Flaws", facts.flaws], ["Measurements", facts.measurements], ["Included", facts.includedItems],
  ["Authenticity", facts.authenticity], ["Bundle info", facts.bundleInfo], ["Original retail price", facts.originalPrice], ["Seller notes", facts.description], ["Seller tags", (facts.tags ?? []).join(", ")],
].filter(([, value]) => clean(value as string)) as Array<[string, string]>;
const factsText = (facts: CopyFacts) => factList(facts).map(([, value]) => value).join(" \n ").toLowerCase();
const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Hashtags that describe the seller's own status claims. Only allowed when the facts support them. */
export function allowedStatusTags(facts: CopyFacts): Set<string> {
  const text = factsText(facts);
  const allowed = new Set<string>();
  if (facts.condition === "new" && /\b(nwt|new with tags|with tags|tags? attached)\b/.test(text)) allowed.add("nwt");
  if (facts.condition === "new" && /\b(nwot|without tags|no tags|tags? removed)\b/.test(text)) allowed.add("nwot");
  if (facts.condition === "like_new") { allowed.add("euc"); allowed.add("nwot"); }
  if (facts.condition === "good") { allowed.add("euc"); allowed.add("guc"); }
  return allowed;
}
const STATUS_TAGS = new Set(["nwt", "nwot", "euc", "guc", "vguc", "nib", "nwb"]);

/** What the seller could add to make the listing stronger. Deterministic, never needs the AI. */
export function improvementHints(facts: CopyFacts, platform: Platform): string[] {
  const hints: string[] = [];
  if (!clean(facts.measurements)) hints.push(platform === "depop" ? "Add measurements. Depop advises them because sizes vary between brands." : "Add measurements. Buyers who see them ask fewer questions and are more likely to buy.");
  if (!clean(facts.brand)) hints.push("Add the brand if you know it. Brand is a top search word on every platform.");
  if (!clean(facts.material)) hints.push("Add the material or fabric if the tag says it.");
  if (!clean(facts.flaws) && facts.condition !== "new") hints.push("Add any flaws, or note that you found none. Honest condition builds trust.");
  if (!clean(facts.size)) hints.push("Add the size from the tag.");
  if (facts.condition === "new" && !allowedStatusTags(facts).size && platform === "poshmark") hints.push("If it still has its tags, add \"NWT\" to the description box so #NWT can be used.");
  return hints.slice(0, 4);
}

function cutAtWord(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? slice.slice(0, lastSpace) : slice).replace(/[\s,;:\-–—]+$/, "");
}

function tidyTitle(raw: string, limit: number): string {
  let title = raw.replace(/[#*_`"“”]/g, "").replace(/\s+/g, " ").trim();
  const letters = title.replace(/[^a-z]/gi, "");
  if (letters.length > 8 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7) {
    title = title.toLowerCase().replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
  }
  return cutAtWord(title, limit);
}

const CLAIM_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /smoke[- ]?free|non[- ]?smok|pet[- ]?free|no pets|from a (clean|smoke)/i, label: "home claim" },
  { re: /\bauthentic(ity)?\b|100% real|guaranteed authentic/i, label: "authenticity claim" },
  { re: /ships?\s+(same|next)[- ]?day|ships?\s+(within|in)\s+\d|fast shipping|free shipping/i, label: "shipping claim" },
  { re: /\bnever worn\b|worn (once|twice|only)/i, label: "wear claim" },
  { re: /\bbox\b|dust ?bag|original packaging/i, label: "extras claim" },
];

function numberTokens(text: string): Set<string> {
  return new Set((text.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));
}

/** Removes sentences that assert something the seller never provided, and reports what was removed. */
export function guardBody(body: string, facts: CopyFacts): { body: string; warnings: string[] } {
  const truth = factsText(facts);
  const truthNumbers = numberTokens(truth);
  const warnings: string[] = [];
  const keptLines = body.split("\n").map((line) => {
    const sentences = line.split(/(?<=[.!?])\s+/);
    const kept = sentences.filter((sentence) => {
      for (const claim of CLAIM_PATTERNS) {
        if (claim.re.test(sentence) && !claim.re.test(truth)) { warnings.push(`Removed a ${claim.label} you did not provide.`); return false; }
      }
      const measures = [...sentence.matchAll(/(\d+(?:\.\d+)?)\s*(?:"|”|in\b|inch(?:es)?|cm|mm|ft\b|feet|lbs?\b|oz\b)/gi)].map((m) => String(Number(m[1])));
      if (measures.some((n) => !truthNumbers.has(n))) { warnings.push("Removed a measurement that was not in your entries."); return false; }
      return true;
    });
    return kept.join(" ");
  });
  return { body: keptLines.join("\n"), warnings: [...new Set(warnings)] };
}

function tidyBody(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/\*\*|__/g, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/^#{1,6}\s+/gm, "")
    .split("\n")
    // A line made only of hashtags belongs in the hashtag list, not the body.
    .filter((line) => !/^\s*(#[\w-]+\s*)+$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanHashtags(list: unknown, platform: Platform, facts: CopyFacts): string[] {
  const playbook = PLAYBOOKS[platform];
  const allowedStatus = allowedStatusTags(facts);
  const truth = norm(factsText(facts));
  const seen = new Set<string>();
  const out: string[] = [];
  const raw = Array.isArray(list) ? list : typeof list === "string" ? list.split(/[\s,]+/) : [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const tag = norm(entry.replace(/^#/, ""));
    if (tag.length < 2 || tag.length > 30 || seen.has(tag)) continue;
    if (STATUS_TAGS.has(tag) && !allowedStatus.has(tag)) continue;
    // A watched brand may only appear as a hashtag when the seller entered it.
    if (WATCHED_BRANDS.some((brand) => norm(brand) === tag) && !truth.includes(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  // Poshmark habit: show the status tag when the facts support it.
  if (platform === "poshmark" && allowedStatus.has("nwt") && !seen.has("nwt")) out.unshift("nwt");
  return out.slice(0, playbook.hashtags.max);
}

function compose(platform: Platform, title: string, body: string, hashtags: string[], limit: number): { description: string; trimmed: boolean } {
  const tagLine = hashtags.length ? hashtags.map((tag) => `#${tag}`).join(" ") : "";
  const head = platform === "depop" ? `${title}\n\n` : "";
  const tail = tagLine ? `\n\n${tagLine}` : "";
  let text = `${head}${body}${tail}`.trim();
  if (text.length <= limit) return { description: text, trimmed: false };
  const room = limit - head.length - tail.length;
  const lines = body.split("\n");
  let kept = "";
  for (const line of lines) {
    if ((kept ? kept + "\n" : "").length + line.length > room) break;
    kept = kept ? `${kept}\n${line}` : line;
  }
  text = `${head}${kept || cutAtWord(body, Math.max(0, room))}${tail}`.trim();
  return { description: text, trimmed: true };
}

const limitsFor = (platform: Platform) => {
  const p = PLAYBOOKS[platform];
  return { title: p.titleLimit, description: p.descriptionLimit, titleVerified: p.titleLimitVerified, descriptionVerified: p.descriptionLimitVerified };
};

/** Deterministic copy in each platform's structure. Used when the AI cannot answer. */
export function templateCopy(platform: Platform, facts: CopyFacts, reason?: string): PlatformCopy {
  const p = PLAYBOOKS[platform];
  const brand = clean(facts.brand);
  const name = clean(facts.title);
  const baseTitle = [brand && !name.toLowerCase().includes(brand.toLowerCase()) ? brand : "", name].filter(Boolean).join(" ");
  const attrs = [clean(facts.color) && !baseTitle.toLowerCase().includes(clean(facts.color).toLowerCase()) ? clean(facts.color) : "", clean(facts.size) ? `Size ${clean(facts.size)}` : ""].filter(Boolean);
  const title = tidyTitle([baseTitle, ...attrs].join(" "), p.titleLimit);
  const condition = CONDITION_LABEL[facts.condition] ?? facts.condition;
  const detailRows: Array<[string, string]> = [["Brand", brand], ["Size", clean(facts.size)], ["Color", [facts.color, facts.secondaryColor].map(clean).filter(Boolean).join(" / ")], ["Material", clean(facts.material)], ["Pattern", clean(facts.pattern)], ["Fit", clean(facts.fit)], ["Style", clean(facts.style)]];
  const rows = detailRows.filter(([, value]) => value).map(([label, value]) => `• ${label}: ${value}`);
  const measurementLines = clean(facts.measurements) ? (facts.measurements ?? "").split(/\n|·|;/).map(clean).filter(Boolean).map((line) => `• ${line}`) : [];
  const flaws = clean(facts.flaws);
  const seller = clean(facts.description);
  let body: string;
  if (platform === "poshmark") {
    body = [
      `${name}${brand ? ` by ${brand}` : ""}. ${condition}.`,
      seller && seller.slice(0, 500),
      ["Details", ...rows, ...(measurementLines.length ? ["Measurements", ...measurementLines] : [])].join("\n"),
      `Condition: ${condition}.${flaws ? ` ${flaws}` : ""}`,
      "Bundles welcome. Add a few of my items to save on shipping.",
    ].filter(Boolean).join("\n\n");
  } else if (platform === "depop") {
    body = [
      seller ? seller.slice(0, 200) : "",
      [...rows.slice(0, 5), ...measurementLines.slice(0, 3)].join("\n"),
      `condition: ${condition.toLowerCase()}${flaws ? `, ${flaws}` : ""}`,
      clean(facts.bundleInfo),
    ].filter(Boolean).join("\n\n");
  } else {
    body = [
      `${name}${brand ? ` from ${brand}` : ""}. Condition: ${condition}.`,
      seller && seller.slice(0, 300),
      [...rows, ...measurementLines].join("\n"),
      flaws ? `Flaws: ${flaws}` : "",
    ].filter(Boolean).join("\n\n");
  }
  const guarded = guardBody(tidyBody(body), facts);
  const tagSource = [brand, facts.category, facts.subcategory, facts.color, facts.material, facts.pattern, facts.style, ...(facts.tags ?? [])].filter((v): v is string => Boolean(v && clean(v)));
  const hashtags = cleanHashtags(tagSource, platform, facts).slice(0, platform === "mercari" ? 3 : platform === "depop" ? 5 : 8);
  const { description, trimmed } = compose(platform, title, guarded.body, hashtags, p.descriptionLimit);
  return {
    platform, title, description, hashtags,
    warnings: [...guarded.warnings, ...(trimmed ? ["Shortened to fit the length limit."] : [])],
    hints: improvementHints(facts, platform), source: "template", model: null, reason, limits: limitsFor(platform), trendsUsed: [],
  };
}

function buildMessages(platform: Platform, facts: CopyFacts, now: Date) {
  const p = PLAYBOOKS[platform];
  const text = factsText(facts);
  const trends = relevantTrends(platform, text);
  const status = [...allowedStatusTags(facts)].map((tag) => `#${tag}`);
  const system = [
    `You write marketplace listing copy for ${p.label} only. Reply with ONE JSON object and nothing else: {"title": string, "body": string, "hashtags": string[]}.`,
    "TRUTH RULES (highest priority): use only the facts under SELLER FACTS. Never invent or guess brand, size, measurements, material, era, flaws, authenticity, tags, box, dust bag, smoke-free or pet-free homes, shipping speed, or discounts. If a fact is missing, leave it out. Mention every flaw the seller listed. Do not say you looked at photos.",
    `PLATFORM: ${p.label}. VOICE: ${p.voice}`,
    `STRUCTURE (follow in order, skip a step if there is no fact for it):\n${p.structure.map((line, index) => `${index + 1}. ${line}`).join("\n")}`,
    `DO:\n${p.do.map((line) => `- ${line}`).join("\n")}`,
    `DON'T:\n${p.dont.map((line) => `- ${line}`).join("\n")}`,
    p.hasTitleField
      ? `"title": at most ${p.titleLimit} characters, no emoji, no hashtags. "body": the description WITHOUT the title and WITHOUT hashtags, under ${Math.floor(p.descriptionLimit * 0.85)} characters, plain text with line breaks (use "• " for facts lines, no markdown).`
      : `"title": the search-word first line, at most 60 characters, no hashtags. "body": everything after that first line, WITHOUT hashtags, under ${Math.floor(p.descriptionLimit * 0.8)} characters, plain text with line breaks, no markdown.`,
    `"hashtags": ${p.hashtags.min} to ${p.hashtags.max} lowercase words without the # sign, only ones that truly describe this item.`,
  ].join("\n\n");
  const user = [
    "SELLER FACTS:",
    factList(facts).map(([label, value]) => `${label}: ${value}`).join("\n"),
    trends.length ? `\nTRENDING ON ${p.label.toUpperCase()} THAT MAY FIT THIS ITEM (from ${p.label}'s own reports, checked ${TRENDS_AS_OF}). Use a word only if it is honestly true for this item:\n${trends.map((trend) => `- ${trend.source}: ${trend.words.join(", ")}`).join("\n")}` : "",
    `\nSEASON WORDS (optional, only if they suit the item): ${seasonWords(now).join(", ")}`,
    status.length ? `\nSTATUS HASHTAGS YOU MAY USE (supported by the facts): ${status.join(" ")}` : "\nDo not use status hashtags such as #NWT or #EUC.",
    "\nWrite the JSON now.",
  ].filter(Boolean).join("\n");
  return { messages: [{ role: "system" as const, content: system }, { role: "user" as const, content: user }], trends };
}

/** Turns a raw model answer into safe, limit-respecting copy. Exported for tests. */
export function finishCopy(platform: Platform, facts: CopyFacts, raw: Record<string, unknown>, model: string, trendsUsed: string[]): PlatformCopy | null {
  const p = PLAYBOOKS[platform];
  const rawTitle = typeof raw.title === "string" ? raw.title : "";
  const rawBody = typeof raw.body === "string" ? raw.body : typeof raw.description === "string" ? raw.description : "";
  if (!clean(rawTitle) || !clean(rawBody)) return null;
  const title = tidyTitle(rawTitle, platform === "depop" ? 60 : p.titleLimit);
  const guarded = guardBody(tidyBody(rawBody), facts);
  if (!clean(guarded.body)) return null;
  const hashtags = cleanHashtags(raw.hashtags, platform, facts);
  const { description, trimmed } = compose(platform, title, guarded.body, hashtags, p.descriptionLimit);
  return {
    platform, title, description, hashtags,
    warnings: [...guarded.warnings, ...(trimmed ? ["Shortened to fit the length limit."] : [])],
    hints: improvementHints(facts, platform), source: "ai", model, limits: limitsFor(platform), trendsUsed,
  };
}

export async function generatePlatformCopy(platform: Platform, facts: CopyFacts, options: { now?: Date } = {}): Promise<PlatformCopy> {
  const { messages, trends } = buildMessages(platform, facts, options.now ?? new Date());
  try {
    let result = await nimChat({ messages, maxTokens: 1100, temperature: 0.55 });
    let parsed = extractJsonObject(result.text);
    let copy = parsed ? finishCopy(platform, facts, parsed, result.model, trends.map((t) => t.source)) : null;
    if (!copy) {
      // One retry with a stricter reminder; models occasionally wrap the JSON in chatter.
      result = await nimChat({ messages: [...messages, { role: "assistant", content: result.text.slice(0, 1500) }, { role: "user", content: "That was not valid. Reply again with ONLY the JSON object with title, body and hashtags." }], maxTokens: 1100, temperature: 0.3 });
      parsed = extractJsonObject(result.text);
      copy = parsed ? finishCopy(platform, facts, parsed, result.model, trends.map((t) => t.source)) : null;
    }
    if (copy) return copy;
    return templateCopy(platform, facts, "The AI answered in a format the app could not read.");
  } catch (error) {
    return templateCopy(platform, facts, nimProblem(error));
  }
}

export async function generateAllCopy(facts: CopyFacts, platforms: Platform[] = PLATFORMS): Promise<Record<string, PlatformCopy>> {
  const results = await Promise.all(platforms.map((platform) => generatePlatformCopy(platform, facts)));
  return Object.fromEntries(results.map((copy) => [copy.platform, copy]));
}
