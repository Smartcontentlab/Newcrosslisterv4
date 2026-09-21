import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, itemsTable, ordersTable } from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { extractJsonObject, nimChat, nimProblem, type NimMessage } from "../lib/nim";
import { compsEstimate, findComps } from "../lib/comps";
import {
  GenerateListingBody,
  GenerateListingResponse,
  GetPriceEstimateBody,
  GetPriceEstimateResponse,
  AiChatBody,
  AiChatResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

/** All AI calls go through the shared client (lib/nim.ts): live model list, fallbacks, readable failure reasons. */
async function callNim(messages: NimMessage[], maxTokens = 1200): Promise<string> {
  return (await nimChat({ messages, maxTokens, temperature: 0.2 })).text;
}

function parseJsonResponse<T>(text: string): T {
  const parsed = extractJsonObject(text);
  if (!parsed) throw new Error("The AI answered in a format the app could not read. Please try again.");
  return parsed as T;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean);
  return [];
}

function normalizePriceEstimate(raw: unknown) {
  const source = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const range = source.priceRange && typeof source.priceRange === "object" ? source.priceRange as Record<string, unknown> : {};
  const suggestedPrice = asNumber(source.suggestedPrice ?? source.estimatedPrice ?? source.averagePrice ?? source.price ?? range.suggestedPrice ?? range.average);
  const minPrice = asNumber(source.minPrice ?? source.minimumPrice ?? source.lowPrice ?? source.min ?? range.minPrice ?? range.min);
  const maxPrice = asNumber(source.maxPrice ?? source.maximumPrice ?? source.highPrice ?? source.max ?? range.maxPrice ?? range.max);
  const fallbackSuggested = suggestedPrice ?? (minPrice !== undefined && maxPrice !== undefined ? (minPrice + maxPrice) / 2 : undefined);
  const fallbackMin = minPrice ?? (fallbackSuggested !== undefined ? fallbackSuggested * 0.8 : undefined);
  const fallbackMax = maxPrice ?? (fallbackSuggested !== undefined ? fallbackSuggested * 1.2 : undefined);

  if (fallbackSuggested === undefined || fallbackMin === undefined || fallbackMax === undefined) {
    throw new Error("NVIDIA NIM returned a price estimate without usable numeric price fields");
  }

  const confidence = ["low", "medium", "high"].includes(String(source.confidence))
    ? String(source.confidence) as "low" | "medium" | "high"
    : "low";
  return GetPriceEstimateResponse.parse({
    suggestedPrice: Math.max(0, Number(fallbackSuggested.toFixed(2))),
    minPrice: Math.max(0, Number(Math.min(fallbackMin, fallbackMax).toFixed(2))),
    maxPrice: Math.max(0, Number(Math.max(fallbackMin, fallbackMax).toFixed(2))),
    confidence,
    reasoning: asString(source.reasoning ?? source.rationale ?? source.explanation, "Check recent sold comparables before finalizing the price."),
  });
}

const MARKETPLACE_STYLES: Record<string, string> = {
  ebay: "keyword-rich, structured, search-optimized with complete item specifics",
  poshmark: "trend-focused, fashion-forward language with style tags",
  depop: "modern, youth-focused with trending fashion terms and hashtag suggestions",
  mercari: "short, clean, mobile-friendly with buyer-focused keywords",
  facebook: "locally optimized, clear and easy to read for neighborhood buyers",
  etsy: "handcrafted storytelling, vintage or artisan language, search-friendly",
  grailed: "menswear-savvy, brand-focused, sizing details prominent",
  whatnot: "live-sale friendly, exciting and engaging language",
  shopify: "professional brand voice, SEO-optimized, conversion-focused",
};

function fallbackListing(item: typeof itemsTable.$inferSelect, marketplace: string) {
  const title = `${item.brand ? `${item.brand} ` : ""}${item.title}`.slice(0, 80);
  const description = [
    item.description?.trim(),
    item.brand ? `Brand: ${item.brand}.` : undefined,
    item.category ? `Category: ${item.category}.` : undefined,
    `Condition: ${item.condition.replace("_", " ")}.`,
    `Prepared for ${marketplace}. Verify measurements and photos before publishing.`,
  ].filter(Boolean).join(" ");
  const tags = [item.brand, item.category, item.condition, marketplace].filter((value): value is string => Boolean(value));
  const keywords = [item.title, item.brand, item.category, item.condition].filter((value): value is string => Boolean(value));
  return GenerateListingResponse.parse({ title, description, tags, keywords, suggestedPrice: item.price ?? null, condition: item.condition });
}

router.post("/ai/generate-listing", async (req, res): Promise<void> => {
  const parsed = GenerateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getAuthenticatedUser(res).id;
  const [item] = await db.select().from(itemsTable).where(and(eq(itemsTable.id, parsed.data.itemId), eq(itemsTable.userId, userId)));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const marketplace = parsed.data.marketplace;
  const style = MARKETPLACE_STYLES[marketplace] ?? "clear and professional";
  try {
    const raw = await callNim([
      { role: "system", content: "You write accurate resale marketplace listings. Return only one valid JSON object with exactly these keys: title (string), description (string), tags (array of strings), keywords (array of strings), suggestedPrice (number or null), condition (string). Keep title under 80 characters. Do not invent item facts." },
      { role: "user", content: JSON.stringify({ marketplace, style, item: { title: item.title, brand: item.brand, model: item.model, category: item.category, condition: item.condition, description: item.description, price: item.price, weight: item.weight, tags: item.tags } }) },
    ], 1400);
    const result = parseJsonResponse<Record<string, unknown>>(raw);
    const normalized = GenerateListingResponse.parse({
      title: asString(result.title, item.title).slice(0, 80),
      description: asString(result.description, item.description ?? `Resale listing for ${item.title}.`),
      tags: asStringArray(result.tags),
      keywords: asStringArray(result.keywords),
      suggestedPrice: asNumber(result.suggestedPrice) ?? item.price ?? null,
      condition: asString(result.condition, item.condition),
    });
    res.json(normalized);
  } catch (error) {
    // Listing generation remains usable when NIM returns malformed output or is temporarily unavailable.
    res.json(fallbackListing(item, marketplace));
  }
});

router.post("/ai/price-estimate", async (req, res): Promise<void> => {
  const parsed = GetPriceEstimateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, brand, model, condition, category } = parsed.data;
  const userId = getAuthenticatedUser(res).id;

  // 1. Real comparable prices from eBay (sold prices when SoldComps is connected). No AI needed for the numbers.
  const comps = await findComps({ title, brand: brand ?? undefined, model: model ?? undefined });
  // 2. The seller's own past sales of similar items (same brand or category) add context and anchor the AI fallback.
  let yourSales: { count: number; average: number; low: number; high: number } | null = null;
  let sales: Array<{ price: number; title: string; brand: string | null; condition: string; marketplace: string }> = [];
  try {
    const similar = [brand ? ilike(itemsTable.brand, brand.trim()) : undefined, category ? eq(itemsTable.category, category) : undefined].filter(Boolean);
    sales = similar.length === 0 ? [] : await db
      .select({ price: ordersTable.salePrice, title: itemsTable.title, brand: itemsTable.brand, condition: itemsTable.condition, marketplace: ordersTable.marketplace })
      .from(ordersTable)
      .innerJoin(itemsTable, eq(ordersTable.itemId, itemsTable.id))
      .where(and(eq(ordersTable.userId, userId), or(...(similar as NonNullable<(typeof similar)[number]>[]))))
      .orderBy(desc(ordersTable.createdAt))
      .limit(15);
    const salePrices = sales.map((sale) => sale.price).filter((price) => price > 0);
    yourSales = salePrices.length
      ? { count: salePrices.length, average: Number((salePrices.reduce((sum, price) => sum + price, 0) / salePrices.length).toFixed(2)), low: Math.min(...salePrices), high: Math.max(...salePrices) }
      : null;
  } catch { /* Sales history is optional context; the suggestion still works without it. */ }

  const compsInfo = { searchUrl: comps.searchUrl, query: comps.query, note: comps.note };
  if (comps.result) {
    const estimate = compsEstimate(comps.result);
    res.json({
      ...estimate,
      reasoning: yourSales ? `${estimate.reasoning} Your own ${yourSales.count} similar sale(s) averaged $${yourSales.average.toFixed(2)}.` : estimate.reasoning,
      yourSales,
      comps: { ...compsInfo, source: comps.result.source, provider: comps.result.provider, count: comps.result.count, median: comps.result.median, low: comps.result.p25, high: comps.result.p75, samples: comps.result.samples },
    });
    return;
  }

  try {
    const raw = await callNim([
      { role: "system", content: "You are a resale pricing analyst. Return only one valid JSON object with exactly these keys: suggestedPrice, minPrice, maxPrice, confidence, reasoning. All three price fields must be numbers. Confidence must be low, medium, or high. Use conservative ranges. reasoning must be two short sentences, say this is an estimate rather than live marketplace data, and mention the seller's own sales when they are provided. If seller sales are provided, weight them heavily." },
      { role: "user", content: JSON.stringify({ title, brand, model, condition, category, sellerPastSales: sales.slice(0, 10) }) },
    ], 1400);
    const estimate = normalizePriceEstimate(parseJsonResponse(raw));
    res.json({ ...estimate, yourSales, basis: yourSales ? `AI estimate + ${yourSales.count} of your past sales` : "AI estimate only (no eBay comps connected)", comps: { ...compsInfo, source: null, count: 0, samples: [] } });
  } catch (error) {
    res.status(502).json({ error: nimProblem(error), ...compsInfo });
  }
});

router.post("/ai/chat", async (req, res): Promise<void> => {
  const parsed = AiChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { message, context } = parsed.data;
  try {
    const raw = await callNim([
      { role: "system", content: "You are CrossLinkOS, a practical resale-management assistant. Give concise, actionable advice about inventory, listing optimization, marketplace fees, shipping, sourcing, profitability, and analytics. Return only valid JSON with keys reply and suggestions, where suggestions is an array of 2 to 4 short follow-up prompts. Do not claim live marketplace data unless it is supplied in context." },
      { role: "user", content: JSON.stringify({ message, context }) },
    ], 1000);
    const result = parseJsonResponse<Record<string, unknown>>(raw);
    res.json(AiChatResponse.parse({ reply: asString(result.reply, "I could not generate a response."), suggestions: asStringArray(result.suggestions) }));
  } catch (error) {
    res.status(502).json({ error: nimProblem(error) });
  }
});

export default router;
