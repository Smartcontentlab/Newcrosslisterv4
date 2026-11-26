import { extractJsonObject, nimChat } from "./nim";

/**
 * Original retail price (MSRP) for Poshmark's "Original price" field when the seller didn't give one.
 * It is the model's knowledge of the brand's usual retail price, not a live lookup, so it is always
 * labelled an estimate, and items with no clear brand get no number at all.
 */
export type RetailEstimate = { retail: number | null; low: number | null; high: number | null; confidence: "high" | "medium" | "low"; basis: string; model?: string };

const SYSTEM = [
  "You estimate the ORIGINAL RETAIL PRICE in US dollars (what the brand charged new) for a resale item.",
  'Reply with ONE JSON object only: {"retail_usd": number|null, "low": number|null, "high": number|null, "confidence": "high"|"medium"|"low", "basis": string}.',
  "Use what you know about the brand's usual retail prices for this kind of item (and the named style, if any).",
  "If the brand is missing, unknown, or a generic/no-name label, reply retail_usd null and confidence low.",
  "basis: one short sentence, e.g. \"Aritzia cashmere cardigans usually retail $148-$198\". Never claim you looked anything up.",
].join("\n");

const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n > 0 && n < 20_000 ? Math.round(n) : null; };

export async function estimateRetail(item: { title: string; brand?: string | null; model?: string | null; category?: string | null; subcategory?: string | null; material?: string | null }): Promise<RetailEstimate> {
  if (!item.brand || !item.brand.trim()) return { retail: null, low: null, high: null, confidence: "low", basis: "No brand, so there is no retail price to estimate." };
  const facts = { title: item.title, brand: item.brand, style: item.model, category: item.category, subcategory: item.subcategory, material: item.material };
  const result = await nimChat({ messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(facts) }], maxTokens: 300, temperature: 0.1 });
  const parsed = extractJsonObject(result.text) ?? {};
  const confidence = ["high", "medium", "low"].includes(String(parsed.confidence)) ? (parsed.confidence as RetailEstimate["confidence"]) : "low";
  const retail = num(parsed.retail_usd);
  return { retail: confidence === "low" ? null : retail, low: num(parsed.low), high: num(parsed.high), confidence, basis: typeof parsed.basis === "string" ? parsed.basis.slice(0, 200) : "", model: result.model };
}
