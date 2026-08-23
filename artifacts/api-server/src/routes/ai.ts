import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, itemsTable } from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import {
  GenerateListingBody,
  GenerateListingResponse,
  GetPriceEstimateBody,
  GetPriceEstimateResponse,
  AiChatBody,
  AiChatResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

type NimMessage = { role: "system" | "user" | "assistant"; content: string };

type NimPayload = {
  choices?: Array<{ message?: { content?: string } }>;
};

async function callNim(messages: NimMessage[], maxTokens = 1200): Promise<string> {
  const apiKey = process.env.NVIDIA_NIM_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_NIM_API_KEY is not configured");

  const baseUrl = (process.env.NVIDIA_NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
  const model = process.env.NVIDIA_NIM_MODEL ?? "nvidia/nemotron-3.5-lightning-30b-a3b";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens }),
  });

  if (!response.ok) {
    const providerBody = (await response.text()).slice(0, 500);
    throw new Error(`NVIDIA NIM returned HTTP ${response.status}${providerBody ? `: ${providerBody}` : ""}`);
  }

  const payload = await response.json() as NimPayload;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("NVIDIA NIM returned an empty response");
  return content;
}

function parseJsonResponse<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("NVIDIA NIM did not return a JSON object");
  return JSON.parse(fenced.slice(start, end + 1)) as T;
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
  try {
    const raw = await callNim([
      { role: "system", content: "You are a resale pricing analyst. Return only one valid JSON object with exactly these keys: suggestedPrice, minPrice, maxPrice, confidence, reasoning. All three price fields must be numbers. Confidence must be low, medium, or high. Use conservative ranges and state that actual sold comparables should be checked." },
      { role: "user", content: JSON.stringify({ title, brand, model, condition, category }) },
    ], 1400);
    res.json(normalizePriceEstimate(parseJsonResponse(raw)));
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "NVIDIA NIM price estimation failed" });
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
    res.status(502).json({ error: error instanceof Error ? error.message : "NVIDIA NIM chat failed" });
  }
});

export default router;
