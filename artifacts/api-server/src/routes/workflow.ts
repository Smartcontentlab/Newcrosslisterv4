import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  delistingTasksTable,
  itemsTable,
  listingsTable,
  marketplaceDraftsTable,
  ordersTable,
  shippingTasksTable,
  type ItemPhotoRecord,
} from "@workspace/db";
import { enqueueDelistingTasksForSale, SUPPORTED_MARKETPLACES } from "../lib/marketplace-workflow";
import { getAuthenticatedUser } from "../lib/auth";
import { extractJsonObject, nimChat, nimProblem, NimError } from "../lib/nim";
import { generateAllCopy, templateCopy, type CopyFacts, type PlatformCopy } from "../lib/listing-copy";
import { PLAYBOOKS, PLATFORMS, TRENDS_AS_OF } from "../lib/platform-playbooks";
import { IMAGE_DATA_URL, MAX_INLINE_IMAGE_CHARS, MAX_PHOTOS_READ, readPhotos } from "../lib/photo-read";

const router: IRouter = Router();
const itemStatus = z.enum(["draft", "active", "sold", "archived"]);
const condition = z.enum(["new", "like_new", "good", "fair", "poor"]);
const marketplace = z.enum(SUPPORTED_MARKETPLACES);
const marketplaceDraftStatus = z.enum(["draft", "ready", "prefilled", "draft_saved", "published", "sold", "delisting", "delisted", "needs_attention"]);
const FINAL_MARKETPLACE_STATUSES = new Set(["published", "sold", "delisting", "delisted"]);
const photoRecord = z.object({
  id: z.string(), original: z.string(), processed: z.string().nullable().optional(),
  active: z.enum(["original", "processed"]), processingStatus: z.enum(["original", "processing", "processed", "failed"]),
  backgroundStyle: z.enum(["white", "textured_slate"]).optional(),
  name: z.string().optional(), createdAt: z.string(),
});
const canonicalItemBody = z.object({
  title: z.string().min(1), description: z.string().optional(), brand: z.string().optional(), model: z.string().optional(),
  category: z.string().optional(), size: z.string().optional(), color: z.string().optional(), measurements: z.string().optional(),
  sku: z.string().optional(), notes: z.string().optional(), sourceLocation: z.string().optional(), sourceUrl: z.string().url().optional().or(z.literal("")),
  condition: condition.default("good"), status: itemStatus.default("draft"), price: z.number().min(0).default(0), cost: z.number().min(0).default(0),
  weight: z.number().min(0).optional(), photos: z.array(z.string()).default([]), photoRecords: z.array(photoRecord).default([]),
  marketplaceDetails: z.record(z.string(), z.unknown()).default({}), tags: z.array(z.string()).default([]),
});
const patchCanonicalItemBody = canonicalItemBody.partial();
const DEFAULT_SHIPPING_STEPS = [
  { key: "locate", label: "Locate item", completed: false, completedAt: null },
  { key: "verify", label: "Verify condition", completed: false, completedAt: null },
  { key: "package", label: "Package item", completed: false, completedAt: null },
  { key: "print_label", label: "Print shipping label", completed: false, completedAt: null },
  { key: "ship", label: "Ship package", completed: false, completedAt: null },
  { key: "mark_shipped", label: "Mark shipped", completed: false, completedAt: null },
  { key: "tracking_uploaded", label: "Tracking uploaded", completed: false, completedAt: null },
  { key: "buyer_notified", label: "Buyer notified", completed: false, completedAt: null },
];
const draftRequirements: Record<string, Array<{ key: string; label: string; help?: string }>> = {
  poshmark: [{ key: "title", label: "Title" }, { key: "description", label: "Description" }, { key: "marketplaceDetails.department", label: "Department" }, { key: "category", label: "Category" }, { key: "marketplaceDetails.subcategory", label: "Subcategory" }, { key: "size", label: "Size" }, { key: "marketplaceDetails.originalPrice", label: "Original price" }, { key: "price", label: "List price" }, { key: "photos", label: "Cover photo" }],
  depop: [{ key: "description", label: "Description" }, { key: "brand", label: "Brand" }, { key: "category", label: "Category" }, { key: "marketplaceDetails.subcategory", label: "Subcategory" }, { key: "size", label: "Size" }, { key: "color", label: "Color" }, { key: "marketplaceDetails.quantity", label: "Quantity" }, { key: "price", label: "List price" }, { key: "marketplaceDetails.depopShippingMethod", label: "Shipping method" }, { key: "photos", label: "At least one photo" }],
  mercari: [{ key: "description", label: "Description" }, { key: "brand", label: "Brand" }, { key: "category", label: "Category" }, { key: "condition", label: "Condition" }, { key: "price", label: "List price" }, { key: "weight", label: "Item/package weight" }, { key: "marketplaceDetails.mercariShippingMethod", label: "Shipping method" }, { key: "marketplaceDetails.mercariPayer", label: "Shipping payer" }, { key: "photos", label: "At least one photo" }],
};

function itemValue(item: typeof itemsTable.$inferSelect, key: string): string | number | boolean | null {
  if (key === "photos") return item.photoRecords.length > 0 || item.photos.length > 0;
  if (key === "price") return item.price;
  if (key.startsWith("marketplaceDetails.")) {
    const details = item.marketplaceDetails as Record<string, unknown>;
    const value = details[key.slice("marketplaceDetails.".length)];
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
  }
  return (item as unknown as Record<string, string | number | boolean | null>)[key] ?? null;
}
const detailText = (details: Record<string, unknown>, key: string) => (typeof details[key] === "string" ? (details[key] as string) : undefined);
/** The facts the copy writer may use, taken from a saved item. */
function factsFromItem(item: typeof itemsTable.$inferSelect): CopyFacts {
  const details = (item.marketplaceDetails ?? {}) as Record<string, unknown>;
  return {
    title: item.title, description: item.description ?? undefined, brand: item.brand ?? undefined, model: item.model ?? undefined, category: item.category ?? undefined,
    subcategory: detailText(details, "subcategory"), department: detailText(details, "department"), size: item.size ?? undefined, color: item.color ?? undefined,
    secondaryColor: detailText(details, "secondaryColor"), condition: item.condition, measurements: item.measurements ?? undefined, material: detailText(details, "material"),
    pattern: detailText(details, "pattern"), fit: detailText(details, "fit"), style: detailText(details, "style"), flaws: detailText(details, "flaws"),
    includedItems: detailText(details, "includedItems"), authenticity: detailText(details, "authenticity"), bundleInfo: detailText(details, "depopBundleInfo"),
    originalPrice: detailText(details, "originalPrice"), tags: item.tags,
  };
}
type SavedCopy = { title: string; description: string; hashtags: string[] };
/** Copy the seller wrote or approved in the studio is used as-is for drafts. */
function savedCopyFor(item: typeof itemsTable.$inferSelect, platform: string): SavedCopy | null {
  const all = (item.marketplaceDetails as Record<string, unknown>)?.platformCopy;
  const entry = all && typeof all === "object" ? (all as Record<string, unknown>)[platform] : null;
  if (!entry || typeof entry !== "object") return null;
  const { title, description, hashtags } = entry as Record<string, unknown>;
  if (typeof description !== "string" || !description.trim()) return null;
  return { title: typeof title === "string" && title.trim() ? title : item.title, description, hashtags: Array.isArray(hashtags) ? hashtags.filter((tag): tag is string => typeof tag === "string") : [] };
}
type DraftContent = { title: string; description: string; tags: string[]; usedFallback: boolean; origin: "seller" | "ai" | "template"; reason?: string };
/** Drafts use, in order: the seller's saved copy, fresh AI copy, or the plain template (flagged so the UI can say so). */
async function draftContentFor(item: typeof itemsTable.$inferSelect): Promise<Record<string, DraftContent>> {
  const facts = factsFromItem(item);
  const missing = PLATFORMS.filter((platform) => !savedCopyFor(item, platform));
  const generated: Record<string, PlatformCopy> = missing.length ? await generateAllCopy(facts, missing) : {};
  const out: Record<string, DraftContent> = {};
  for (const platform of PLATFORMS) {
    const saved = savedCopyFor(item, platform);
    if (saved) { out[platform] = { title: saved.title, description: saved.description, tags: saved.hashtags, usedFallback: false, origin: "seller" }; continue; }
    const copy = generated[platform] ?? templateCopy(platform, facts);
    out[platform] = { title: copy.title, description: copy.description, tags: copy.hashtags, usedFallback: copy.source === "template", origin: copy.source, reason: copy.reason };
  }
  return out;
}
async function ownedItem(id: number, userId: string) {
  const [item] = await db.select().from(itemsTable).where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)));
  return item;
}

router.get("/workflow/items", async (_request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  const items = await db.select().from(itemsTable).where(eq(itemsTable.userId, userId)).orderBy(desc(itemsTable.updatedAt));
  response.json(items);
});
router.post("/workflow/items", async (request, response): Promise<void> => {
  const parsed = canonicalItemBody.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: parsed.error.flatten() }); return; }
  const userId = getAuthenticatedUser(response).id;
  const [item] = await db.insert(itemsTable).values({ ...parsed.data, userId, sourceUrl: parsed.data.sourceUrl || null }).returning();
  response.status(201).json(item);
});
/** One row per physical item; Poshmark, Depop, and Mercari drafts are nested for compact status chips. */
router.get("/workflow/draft-board", async (_request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  const [items, drafts] = await Promise.all([
    db.select().from(itemsTable).where(eq(itemsTable.userId, userId)).orderBy(desc(itemsTable.updatedAt)),
    db.select().from(marketplaceDraftsTable).where(eq(marketplaceDraftsTable.userId, userId)),
  ]);
  const draftsByItem = new Map<number, typeof drafts>();
  for (const draft of drafts) {
    if (!SUPPORTED_MARKETPLACES.includes(draft.marketplace as (typeof SUPPORTED_MARKETPLACES)[number])) continue;
    draftsByItem.set(draft.itemId, [...(draftsByItem.get(draft.itemId) ?? []), draft]);
  }
  response.json(items
    .filter((item) => !["sold", "archived"].includes(item.status))
    .map((item) => ({ item, drafts: draftsByItem.get(item.id) ?? [] })));
});

router.get("/workflow/items/:id", async (request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id; const id = Number(request.params.id); const item = await ownedItem(id, userId);
  if (!item) { response.status(404).json({ error: "Item not found" }); return; }
  const [drafts, delistingTasks] = await Promise.all([
    db.select().from(marketplaceDraftsTable).where(and(eq(marketplaceDraftsTable.itemId, id), eq(marketplaceDraftsTable.userId, userId))),
    db.select().from(delistingTasksTable).where(and(eq(delistingTasksTable.itemId, id), eq(delistingTasksTable.userId, userId))),
  ]);
  response.json({ item, drafts, delistingTasks });
});
router.patch("/workflow/items/:id", async (request, response): Promise<void> => {
  const parsed = patchCanonicalItemBody.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: parsed.error.flatten() }); return; }
  const userId = getAuthenticatedUser(response).id; const id = Number(request.params.id);
  const [item] = await db.update(itemsTable).set({ ...parsed.data, sourceUrl: parsed.data.sourceUrl || null }).where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId))).returning();
  if (!item) { response.status(404).json({ error: "Item not found" }); return; }
  response.json(item);
});
type AssistFields = { title: string; description?: string | null; brand?: string | null; model?: string | null; category?: string | null; size?: string | null; color?: string | null; condition: string; measurements?: string | null; tags?: string[]; material?: string | null; flaws?: string | null };
type AssistFocus = "all" | "title" | "tags";
/**
 * Suggests a canonical title / description / tags from the seller's own facts.
 * If the AI cannot answer this throws, and the route reports the real reason. It never pretends a template is an AI answer.
 */
async function assistFromFields(item: AssistFields, focus: AssistFocus) {
  const tags = item.tags ?? [];
  const goal = focus === "title"
    ? "Write ONE better item title: brand first (if given), then item type, then key attributes such as color, material, style or size. At most 80 characters, no emoji, no hype words, nothing that is not in the facts."
    : focus === "tags"
      ? "Suggest 8 to 10 short search tags a buyer would type for this item. Only tags that truly describe it."
      : "Write a clear, honest description of 3 to 5 short sentences, plus a matching title and tags.";
  const system = "You assist resale sellers. Return ONLY one JSON object with keys title, description, tags (array of strings), category, color, size and confidence. Use an empty string for anything you cannot support. Use only the seller's facts. Never invent measurements, flaws, brand, materials or authenticity. Do not claim you looked at photos.";
  const facts = { title: item.title, description: item.description, brand: item.brand, model: item.model, category: item.category, size: item.size, color: item.color, material: item.material, condition: item.condition, measurements: item.measurements, flaws: item.flaws, tags };
  const result = await nimChat({ messages: [{ role: "system", content: system }, { role: "user", content: `${goal}\nSeller facts: ${JSON.stringify(facts)}` }], maxTokens: 700, temperature: 0.35 });
  const parsed = extractJsonObject(result.text);
  if (!parsed) throw new NimError("The AI answered in a format the app could not read. Please try again.", "empty");
  const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return {
    title: str(parsed.title).slice(0, 80) || item.title,
    description: str(parsed.description) || item.description || "",
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.replace(/^#/, "").trim()).filter(Boolean).slice(0, 10) : tags,
    category: str(parsed.category) || item.category || "", color: str(parsed.color) || item.color || "", size: str(parsed.size) || item.size || "",
    confidence: str(parsed.confidence) || "Seller review required", model: result.model,
  };
}
const assistBody = z.object({
  title: z.string().trim().min(1), description: z.string().optional(), brand: z.string().optional(), model: z.string().optional(),
  category: z.string().optional(), size: z.string().optional(), color: z.string().optional(), material: z.string().optional(),
  flaws: z.string().optional(), measurements: z.string().optional(), condition: condition.default("good"),
  tags: z.array(z.string()).default([]), focus: z.enum(["all", "title", "tags"]).default("all"),
});
const failAi = (response: import("express").Response, error: unknown) => {
  response.status(error instanceof NimError && error.code === "not_configured" ? 503 : 502).json({ error: nimProblem(error) });
};
// Works straight from the form, so listing help does not need a saved item (or a database) first.
router.post("/workflow/ai-assist", async (request, response): Promise<void> => {
  getAuthenticatedUser(response);
  const parsed = assistBody.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Add an item title first. The AI works from the facts you enter." }); return; }
  const { focus, ...fields } = parsed.data;
  try { response.json(await assistFromFields(fields, focus)); } catch (error) { failAi(response, error); }
});
router.post("/workflow/items/:id/ai-assist", async (request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id; const item = await ownedItem(Number(request.params.id), userId);
  if (!item) { response.status(404).json({ error: "Item not found" }); return; }
  try { response.json(await assistFromFields(item, "all")); } catch (error) { failAi(response, error); }
});

const copyBody = z.object({
  title: z.string().trim().min(1), description: z.string().optional(), brand: z.string().optional(), model: z.string().optional(), category: z.string().optional(),
  subcategory: z.string().optional(), department: z.string().optional(), size: z.string().optional(), color: z.string().optional(), secondaryColor: z.string().optional(),
  condition: condition.default("good"), measurements: z.string().optional(), material: z.string().optional(), pattern: z.string().optional(), fit: z.string().optional(),
  style: z.string().optional(), flaws: z.string().optional(), includedItems: z.string().optional(), authenticity: z.string().optional(), bundleInfo: z.string().optional(),
  originalPrice: z.string().optional(), tags: z.array(z.string()).default([]), platforms: z.array(marketplace).min(1).default([...PLATFORMS]),
});
// Per-platform copy (title, description, hashtags) written to each marketplace's own conventions. Works from the form, no saved item needed.
router.post("/workflow/listing-copy", async (request, response): Promise<void> => {
  getAuthenticatedUser(response);
  const parsed = copyBody.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Add an item title first. The writer works from the facts you enter." }); return; }
  const { platforms, ...facts } = parsed.data;
  const copies = await generateAllCopy(facts, platforms);
  const template = Object.values(copies).filter((copy) => copy.source === "template");
  response.json({
    copies, trendsAsOf: TRENDS_AS_OF,
    playbooks: Object.fromEntries(platforms.map((platform) => [platform, { voice: PLAYBOOKS[platform].voice, sources: PLAYBOOKS[platform].sources, hashtags: PLAYBOOKS[platform].hashtags }])),
    // If every platform fell back, the AI is down: say why once so the UI can show a clear notice.
    aiProblem: template.length === Object.keys(copies).length ? template[0]?.reason ?? null : null,
  });
});

const photoBody = z.object({
  photos: z.array(z.string().max(MAX_INLINE_IMAGE_CHARS).regex(IMAGE_DATA_URL)).min(1).max(MAX_PHOTOS_READ),
  hints: z.object({ title: z.string().optional(), brand: z.string().optional(), category: z.string().optional() }).optional(),
});
// "Read my photos": a vision model proposes listing facts from the photos. The seller reviews before anything is applied.
router.post("/workflow/photo-read", async (request, response): Promise<void> => {
  getAuthenticatedUser(response);
  const parsed = photoBody.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Add 1 to 3 photos (JPG, PNG or WEBP). The app shrinks them before sending." }); return; }
  try {
    const { facts, model, photosRead } = await readPhotos(parsed.data.photos, parsed.data.hints);
    response.json({ ...facts, model, photosRead });
  } catch (error) { failAi(response, error); }
});
router.post("/workflow/items/:id/marketplace-drafts", async (request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id; const item = await ownedItem(Number(request.params.id), userId);
  if (!item) { response.status(404).json({ error: "Item not found" }); return; }
  const drafts = [];
  const contents = await draftContentFor(item);
  for (const platform of SUPPORTED_MARKETPLACES) {
    const content = contents[platform];
    const requirements = draftRequirements[platform].map((field) => ({ ...field, required: true, value: itemValue(item, field.key) }));
    const missingFields = requirements.filter((field) => field.value === null || field.value === "" || field.value === false || field.value === 0).map((field) => field.key);
    const calculatedStatus = missingFields.length === 0 ? "ready" : "draft";
    const [existing] = await db.select().from(marketplaceDraftsTable).where(and(
      eq(marketplaceDraftsTable.itemId, item.id),
      eq(marketplaceDraftsTable.userId, userId),
      eq(marketplaceDraftsTable.marketplace, platform),
    ));
    const status = existing && FINAL_MARKETPLACE_STATUSES.has(existing.status) ? existing.status : calculatedStatus;
    const [draft] = await db.insert(marketplaceDraftsTable).values({ userId, itemId: item.id, marketplace: platform, status, title: content.title, description: content.description, tags: content.tags, price: item.price, requiredFields: requirements, missingFields }).onConflictDoUpdate({ target: [marketplaceDraftsTable.itemId, marketplaceDraftsTable.marketplace], set: { status, title: content.title, description: content.description, tags: content.tags, price: item.price, requiredFields: requirements, missingFields } }).returning();
    drafts.push({ ...draft, usedFallback: content.usedFallback, copyOrigin: content.origin, copyReason: content.reason ?? null });
  }
  response.json(drafts);
});
router.get("/workflow/items/:id/marketplace-drafts", async (request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id; const itemId = Number(request.params.id); const item = await ownedItem(itemId, userId);
  if (!item) { response.status(404).json({ error: "Item not found" }); return; }
  response.json(await db.select().from(marketplaceDraftsTable).where(and(eq(marketplaceDraftsTable.itemId, itemId), eq(marketplaceDraftsTable.userId, userId))));
});
router.patch("/workflow/marketplace-drafts/:id", async (request, response): Promise<void> => {
  const parsed = z.object({ status: marketplaceDraftStatus.optional(), title: z.string().optional(), description: z.string().optional(), tags: z.array(z.string()).optional(), price: z.number().min(0).optional(), externalListingId: z.string().optional(), externalUrl: z.string().url().optional().or(z.literal("")) }).safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: parsed.error.flatten() }); return; }
  const userId = getAuthenticatedUser(response).id;
  const update = { ...parsed.data, externalUrl: parsed.data.externalUrl || null, ...(parsed.data.status === "published" ? { publishedAt: new Date() } : {}) };
  const [draft] = await db.update(marketplaceDraftsTable).set(update).where(and(eq(marketplaceDraftsTable.id, Number(request.params.id)), eq(marketplaceDraftsTable.userId, userId))).returning();
  if (!draft) { response.status(404).json({ error: "Marketplace draft not found" }); return; }
  response.json(draft);
});
router.post("/workflow/items/:id/mark-sold", async (request, response): Promise<void> => {
  const parsed = z.object({ marketplace, salePrice: z.number().min(0), fees: z.number().min(0).optional(), shippingCost: z.number().min(0).optional(), buyerName: z.string().optional(), trackingNumber: z.string().optional(), notes: z.string().optional() }).safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: parsed.error.flatten() }); return; }
  const userId = getAuthenticatedUser(response).id; const itemId = Number(request.params.id); const item = await ownedItem(itemId, userId);
  if (!item) { response.status(404).json({ error: "Item not found" }); return; }
  const [sourceDraft] = await db.select().from(marketplaceDraftsTable).where(and(eq(marketplaceDraftsTable.itemId, itemId), eq(marketplaceDraftsTable.userId, userId), eq(marketplaceDraftsTable.marketplace, parsed.data.marketplace)));
  const profit = parsed.data.salePrice - item.cost - (parsed.data.fees ?? 0) - (parsed.data.shippingCost ?? 0);
  const [order] = await db.insert(ordersTable).values({ userId, itemId, listingId: null, marketplace: parsed.data.marketplace, buyerName: parsed.data.buyerName, salePrice: parsed.data.salePrice, fees: parsed.data.fees ?? 0, shippingCost: parsed.data.shippingCost ?? 0, profit, status: "awaiting_shipment", trackingNumber: parsed.data.trackingNumber, notes: parsed.data.notes }).returning();
  await db.insert(shippingTasksTable).values({ userId, orderId: order.id, steps: DEFAULT_SHIPPING_STEPS });
  await db.update(itemsTable).set({ status: "sold", soldPlatform: parsed.data.marketplace, soldAt: new Date() }).where(and(eq(itemsTable.id, itemId), eq(itemsTable.userId, userId)));
  if (sourceDraft) await db.update(marketplaceDraftsTable).set({ status: "sold", soldAt: new Date() }).where(and(eq(marketplaceDraftsTable.id, sourceDraft.id), eq(marketplaceDraftsTable.userId, userId)));
  const queued = await enqueueDelistingTasksForSale({ userId, itemId, orderId: order.id, soldMarketplace: parsed.data.marketplace });
  response.status(201).json({ order, delistingTasksQueued: queued, fulfillmentStatus: "awaiting_shipment" });
});
router.get("/workflow/delisting-tasks", async (_request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  const [tasks, items] = await Promise.all([
    db.select().from(delistingTasksTable).where(eq(delistingTasksTable.userId, userId)).orderBy(desc(delistingTasksTable.createdAt)),
    db.select({ id: itemsTable.id, title: itemsTable.title }).from(itemsTable).where(eq(itemsTable.userId, userId)),
  ]);
  const itemMap = new Map(items.map((item) => [item.id, item.title]));
  response.json(tasks.map((task) => ({ ...task, itemTitle: itemMap.get(task.itemId) ?? "Unknown item" })));
});
router.patch("/workflow/delisting-tasks/:id", async (request, response): Promise<void> => {
  const parsed = z.object({ status: z.enum(["pending", "in_progress", "completed", "failed"]), note: z.string().optional() }).safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: parsed.error.flatten() }); return; }
  const userId = getAuthenticatedUser(response).id;
  const [task] = await db.update(delistingTasksTable).set({ status: parsed.data.status, note: parsed.data.note, completedAt: parsed.data.status === "completed" ? new Date() : null }).where(and(eq(delistingTasksTable.id, Number(request.params.id)), eq(delistingTasksTable.userId, userId))).returning();
  if (!task) { response.status(404).json({ error: "Delisting task not found" }); return; }
  if (task.marketplaceDraftId && parsed.data.status === "completed") await db.update(marketplaceDraftsTable).set({ status: "delisted" }).where(and(eq(marketplaceDraftsTable.id, task.marketplaceDraftId), eq(marketplaceDraftsTable.userId, userId)));
  if (parsed.data.status === "completed") await db.update(listingsTable).set({ status: "ended" }).where(and(eq(listingsTable.itemId, task.itemId), eq(listingsTable.userId, userId), eq(listingsTable.marketplace, task.marketplace)));
  response.json(task);
});

export default router;
