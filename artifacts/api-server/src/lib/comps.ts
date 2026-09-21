/**
 * Comparable prices for the "AI suggestion?" button.
 *
 * Provider chain, best evidence first:
 *   1. SoldComps (sold-listings API for eBay). Real sold prices. Needs SOLDCOMPS_API_KEY (free plan: 100 searches a month).
 *   2. eBay Browse API. Active listings, so these are ASKING prices, not sold prices, and are labelled that way.
 *      Needs EBAY_CLIENT_ID and EBAY_CLIENT_SECRET (a free eBay developer keyset).
 *   3. Nothing configured or too few matches: the caller falls back to the AI estimate plus the seller's own past sales.
 *
 * Results are cached in memory for 12 hours per search so repeated clicks do not burn a small monthly quota.
 * Keys are read from the environment only, sent only to the provider, and never returned or logged.
 */

export type Comp = { title: string; price: number; endedAt?: string; url?: string };
export type CompsResult = {
  source: "sold" | "active";
  provider: "soldcomps" | "ebay-browse";
  query: string;
  count: number;
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  samples: Comp[];
  windowDays: number | null;
};
export type CompsOutcome = { result: CompsResult | null; query: string; searchUrl: string; note: string };

const NOISE = new Set(["the", "a", "an", "and", "or", "for", "with", "in", "of", "size", "sz", "nwt", "nwot", "euc", "guc", "vguc", "new", "used", "women", "womens", "women's", "men", "mens", "men's", "vintage"]);
const BAD_TITLE = /\b(lot of|lot|bundle of|for parts|parts only|not working|broken|repair|read description|as is|empty box|box only|case only|pattern only|poster|sticker)\b/i;

export function buildQuery(item: { title: string; brand?: string; model?: string }): string {
  const words: string[] = [];
  const seen = new Set<string>();
  for (const word of [item.brand ?? "", item.model ?? "", item.title].join(" ").split(/[^A-Za-z0-9'&.-]+/)) {
    const key = word.toLowerCase();
    if (!word || seen.has(key) || NOISE.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return words.slice(0, 8).join(" ");
}

/** eBay's own sold-items page for the same search, for the seller to check by eye. Works with no keys at all. */
export const ebaySoldSearchUrl = (query: string) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&rt=nc`;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
const money = (n: number) => Math.round(n * 100) / 100;

/** Drops junk titles and wild outliers, then summarizes. Returns null when fewer than 3 usable comps remain. */
export function summarize(comps: Comp[], meta: { source: CompsResult["source"]; provider: CompsResult["provider"]; query: string; windowDays: number | null }): CompsResult | null {
  const usable = comps.filter((comp) => Number.isFinite(comp.price) && comp.price > 0 && !BAD_TITLE.test(comp.title));
  if (usable.length < 3) return null;
  const firstPass = usable.map((comp) => comp.price).sort((a, b) => a - b);
  const mid = percentile(firstPass, 0.5);
  const kept = usable.filter((comp) => comp.price >= mid * 0.4 && comp.price <= mid * 2.5);
  if (kept.length < 3) return null;
  const prices = kept.map((comp) => comp.price).sort((a, b) => a - b);
  const samples = [...kept].sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? "")).slice(0, 5);
  return {
    ...meta, count: kept.length, median: money(percentile(prices, 0.5)), p25: money(percentile(prices, 0.25)), p75: money(percentile(prices, 0.75)),
    min: money(prices[0]), max: money(prices[prices.length - 1]), samples,
  };
}

type SoldItem = { title?: string; soldPrice?: string | number; soldCurrency?: string; endedAt?: string; url?: string };

export async function fetchSoldComps(query: string, key: string, fetchImpl: typeof fetch = fetch): Promise<Comp[]> {
  const base = (process.env.SOLDCOMPS_BASE_URL ?? "https://api.sold-comps.com").replace(/\/$/, "");
  const response = await fetchImpl(`${base}/v1/scrape?keyword=${encodeURIComponent(query)}&ebaySite=ebay.com&count=40`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 401 || response.status === 403) throw new Error("SoldComps rejected the key (SOLDCOMPS_API_KEY).");
  if (response.status === 429) throw new Error("SoldComps monthly or per-minute limit reached.");
  if (!response.ok) throw new Error(`SoldComps answered HTTP ${response.status}.`);
  const payload = await response.json() as { items?: SoldItem[] };
  return (payload.items ?? [])
    .filter((item) => !item.soldCurrency || item.soldCurrency === "USD")
    .map((item) => ({ title: String(item.title ?? ""), price: Number(String(item.soldPrice ?? "").replace(/[^0-9.]/g, "")), endedAt: item.endedAt, url: item.url }));
}

let ebayToken: { value: string; expires: number } | null = null;

export async function fetchActiveComps(query: string, clientId: string, clientSecret: string, fetchImpl: typeof fetch = fetch): Promise<Comp[]> {
  if (!ebayToken || ebayToken.expires < Date.now() + 60_000) {
    const tokenResponse = await fetchImpl("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` },
      body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) throw new Error(`eBay did not accept the developer keys (HTTP ${tokenResponse.status}).`);
    const token = await tokenResponse.json() as { access_token?: string; expires_in?: number };
    if (!token.access_token) throw new Error("eBay returned no access token.");
    ebayToken = { value: token.access_token, expires: Date.now() + (token.expires_in ?? 7200) * 1000 };
  }
  const response = await fetchImpl(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=50&filter=${encodeURIComponent("buyingOptions:{FIXED_PRICE}")}`, {
    headers: { Authorization: `Bearer ${ebayToken.value}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`eBay search answered HTTP ${response.status}.`);
  const payload = await response.json() as { itemSummaries?: Array<{ title?: string; price?: { value?: string; currency?: string }; itemWebUrl?: string }> };
  return (payload.itemSummaries ?? [])
    .filter((item) => !item.price?.currency || item.price.currency === "USD")
    .map((item) => ({ title: String(item.title ?? ""), price: Number(item.price?.value ?? NaN), url: item.itemWebUrl }));
}

const cache = new Map<string, { at: number; outcome: CompsOutcome }>();
export const resetCompsCache = () => { cache.clear(); ebayToken = null; };

export async function findComps(item: { title: string; brand?: string; model?: string }, fetchImpl: typeof fetch = fetch): Promise<CompsOutcome> {
  const query = buildQuery(item);
  const searchUrl = ebaySoldSearchUrl(query);
  const cached = cache.get(query.toLowerCase());
  if (cached && Date.now() - cached.at < 12 * 3_600_000) return cached.outcome;

  const soldKey = process.env.SOLDCOMPS_API_KEY;
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const notes: string[] = [];
  let outcome: CompsOutcome | null = null;

  if (soldKey) {
    try {
      const result = summarize(await fetchSoldComps(query, soldKey, fetchImpl), { source: "sold", provider: "soldcomps", query, windowDays: 90 });
      if (result) outcome = { result, query, searchUrl, note: `${result.count} recent eBay sold prices (last 90 days).` };
      else notes.push("SoldComps found too few matching sold items for this search.");
    } catch (error) { notes.push(error instanceof Error ? error.message : "SoldComps could not be reached."); }
  }
  if (!outcome && clientId && clientSecret) {
    try {
      const result = summarize(await fetchActiveComps(query, clientId, clientSecret, fetchImpl), { source: "active", provider: "ebay-browse", query, windowDays: null });
      if (result) outcome = { result, query, searchUrl, note: `${result.count} current eBay asking prices. These are asking prices, not sold prices.` };
      else notes.push("eBay had too few matching listings for this search.");
    } catch (error) { notes.push(error instanceof Error ? error.message : "eBay could not be reached."); }
  }
  if (!outcome) {
    if (!soldKey && !(clientId && clientSecret)) notes.push("No comps provider is connected yet (add SOLDCOMPS_API_KEY in Vercel).");
    outcome = { result: null, query, searchUrl, note: notes.join(" ") };
  }
  // Only successful lookups are cached, so a temporary outage is retried on the next click.
  if (outcome.result) cache.set(query.toLowerCase(), { at: Date.now(), outcome });
  return outcome;
}

export function compsEstimate(result: CompsResult) {
  const sold = result.source === "sold";
  const confidence = sold ? (result.count >= 10 ? "high" : result.count >= 5 ? "medium" : "low") : result.count >= 15 ? "medium" : "low";
  const reasoning = sold
    ? `Median of ${result.count} recent eBay sold prices for "${result.query}": $${result.median.toFixed(2)}. Most sold between $${result.p25.toFixed(2)} and $${result.p75.toFixed(2)}.`
    : `Median of ${result.count} current eBay asking prices for "${result.query}": $${result.median.toFixed(2)}. These are asking prices, and sold prices usually land lower, so the low end of the range is a safer start.`;
  return { suggestedPrice: result.median, minPrice: result.p25, maxPrice: result.p75, confidence, reasoning, basis: sold ? `${result.count} eBay sold prices, last 90 days` : `${result.count} eBay asking prices (not sold)` } as const;
}
