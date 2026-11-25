/**
 * Autopilot API: used by Hermes on the seller's laptop and by the extension's auto-post mode,
 * both signed in with an access key (see lib/agent-keys.ts).
 *
 *   POST /autopilot/items                 create an item from a photo folder + photo-read facts
 *   GET  /autopilot/review                items waiting for the seller's approval (no photos, small)
 *   POST /autopilot/items/:id/approve     seller approved: Ready to push drafts become "approved"
 *   POST /autopilot/items/:id/unapprove   take approved drafts back to Ready to push
 *   GET  /autopilot/queue                 next approved draft for the extension, with photos
 *   POST /autopilot/drafts/:id/result     the extension reports posted (with link) or a problem
 *
 * Nothing here posts by itself: posting happens in the seller's own Chrome, through the extension,
 * only for drafts the seller approved.
 */
import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, itemsTable, marketplaceDraftsTable, type ItemPhotoRecord } from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { IMAGE_DATA_URL } from "../lib/photo-read";
import { titleCase } from "../lib/title-case";
import { estimateWeight } from "../lib/weight";

const router: IRouter = Router();

/** Marketplaces the extension can post on its own. Mercari only fills basic fields today. */
export const AUTO_POST_MARKETPLACES = ["poshmark", "depop"] as const;
const MAX_STORED_PHOTOS = 8;
const MAX_STORED_PHOTO_CHARS = 600_000;

const DEFAULT_DETAILS = {
  quantity: "1", poshSmartSellMode: "off", poshAvailability: "draft",
  depopShippingMethod: "depop_shipping", depopWorldwide: false,
  mercariShippingMethod: "prepaid_label", mercariPayer: "buyer",
};

const text = (max = 200) => z.string().trim().max(max).optional();
const ingestBody = z.object({
  folder: z.string().trim().min(1).max(200),
  photos: z.array(z.string().max(MAX_STORED_PHOTO_CHARS).regex(IMAGE_DATA_URL)).min(1).max(MAX_STORED_PHOTOS),
  facts: z.object({
    title: text(), brand: text(), model: text(), category: text(), subcategory: text(), department: text(), color: text(),
    secondaryColor: text(), material: text(), pattern: text(), style: text(), size: text(),
    flaws: z.array(z.string().max(200)).max(8).optional(),
  }).default({}),
  condition: z.enum(["new", "like_new", "good", "fair", "poor"]).optional(),
  price: z.number().min(0).max(100_000).optional(),
  cost: z.number().min(0).max(100_000).optional(),
  notes: text(2000),
  description: text(5000),
  title: text(80),
  tags: z.array(z.string().trim().max(60)).max(25).optional(),
  sku: text(80),
});

router.post("/autopilot/items", async (request, response): Promise<void> => {
  const parsed = ingestBody.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Send a folder name and 1 to 8 photos as JPG, PNG or WEBP data URLs (each under about 450 KB)." }); return; }
  const userId = getAuthenticatedUser(response).id;
  const { folder, photos, facts, notes } = parsed.data;
  // The folder name is the seller's own label for the item, so it beats a guessed title.
  // "01_Navy_Cargo_Pants" -> "Navy Cargo Pants": a leading number only orders the batch.
  const title = parsed.data.title ? parsed.data.title.trim() : titleCase(folder.replace(/^\s*#?\d{1,3}\s*[\s_.)-]+/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim()).slice(0, 80) || facts.title || "Untitled item";
  const createdAt = new Date().toISOString();
  const photoRecords: ItemPhotoRecord[] = photos.map((photo, index) => ({ id: `ap-${Date.now()}-${index}`, original: photo, active: "original", processingStatus: "original", name: `photo-${index + 1}.jpg`, createdAt }));
  const marketplaceDetails: Record<string, unknown> = { ...DEFAULT_DETAILS };
  for (const key of ["subcategory", "department", "secondaryColor", "material", "pattern", "style"] as const) if (facts[key]) marketplaceDetails[key] = facts[key];
  if (facts.flaws?.length) marketplaceDetails.flaws = facts.flaws.join("; ");
  marketplaceDetails.autopilot = { source: "hermes", folder, createdAt };
  // The seller's own written title + description (from her batch doc) is used word for word on
  // every platform, instead of AI copy; the drafts read it from platformCopy.
  if (parsed.data.title && parsed.data.description) {
    const copy = { title: parsed.data.title.trim(), description: parsed.data.description, hashtags: parsed.data.tags ?? [] };
    marketplaceDetails.platformCopy = { poshmark: copy, depop: copy, mercari: copy };
  }
  const weight = estimateWeight({ title, model: facts.model, category: facts.category, subcategory: facts.subcategory });
  const [item] = await db.insert(itemsTable).values({
    userId, title, brand: facts.brand || null, model: facts.model || null, category: facts.category || null, size: facts.size || null,
    color: facts.color || null, condition: parsed.data.condition ?? "good", price: parsed.data.price ?? 0, cost: parsed.data.cost ?? 0,
    weight, tags: parsed.data.tags ?? [], description: parsed.data.description || null, notes: notes || null, sku: parsed.data.sku || null, photos, photoRecords, marketplaceDetails, status: "draft",
  }).returning();
  response.status(201).json({ id: item.id, title: item.title, weight: item.weight, photos: photos.length });
});

type Row = { item: typeof itemsTable.$inferSelect; drafts: Array<typeof marketplaceDraftsTable.$inferSelect> };
function reviewEntry({ item, drafts }: Row) {
  const details = (item.marketplaceDetails ?? {}) as Record<string, unknown>;
  const labels = (draft: typeof marketplaceDraftsTable.$inferSelect) => draft.missingFields.map((key) => draft.requiredFields.find((field) => field.key === key)?.label ?? key);
  return {
    id: item.id, title: item.title, brand: item.brand, size: item.size, condition: item.condition, price: item.price, cost: item.cost,
    originalPrice: details.originalPrice ?? null, department: details.department ?? null, category: item.category, subcategory: details.subcategory ?? null,
    research: details.priceResearch ?? null, photoCount: item.photoRecords.length || item.photos.length, updatedAt: item.updatedAt,
    drafts: Object.fromEntries(drafts.map((draft) => [draft.marketplace, { id: draft.id, status: draft.status, title: draft.title, price: draft.price, stillNeeds: labels(draft), url: draft.externalUrl }])),
    app: `/listing-studio?item=${item.id}`,
  };
}

router.get("/autopilot/review", async (request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  const only = typeof request.query.status === "string" ? request.query.status : "";
  const items = await db.select().from(itemsTable).where(and(eq(itemsTable.userId, userId), inArray(itemsTable.status, ["draft", "active"]))).orderBy(desc(itemsTable.updatedAt)).limit(60);
  if (!items.length) { response.json({ items: [] }); return; }
  const drafts = await db.select().from(marketplaceDraftsTable).where(and(eq(marketplaceDraftsTable.userId, userId), inArray(marketplaceDraftsTable.itemId, items.map((item) => item.id))));
  const rows = items.map((item) => ({ item, drafts: drafts.filter((draft) => draft.itemId === item.id) }));
  const filtered = only ? rows.filter((row) => row.drafts.some((draft) => draft.status === only)) : rows;
  response.json({ items: filtered.map(reviewEntry) });
});

const approveBody = z.object({ marketplaces: z.array(z.enum(AUTO_POST_MARKETPLACES)).min(1).optional() }).default({});
router.post("/autopilot/items/:id/approve", async (request, response): Promise<void> => {
  const parsed = approveBody.safeParse(request.body ?? {});
  if (!parsed.success) { response.status(400).json({ error: `Auto-post works for ${AUTO_POST_MARKETPLACES.join(" and ")}.` }); return; }
  const userId = getAuthenticatedUser(response).id; const itemId = Number(request.params.id);
  const wanted = parsed.data.marketplaces ?? [...AUTO_POST_MARKETPLACES];
  const drafts = await db.select().from(marketplaceDraftsTable).where(and(eq(marketplaceDraftsTable.userId, userId), eq(marketplaceDraftsTable.itemId, itemId)));
  if (!drafts.length) { response.status(404).json({ error: "No drafts for this item yet. Generate its drafts first." }); return; }
  const approved: string[] = []; const notReady: Array<{ marketplace: string; status: string; stillNeeds: string[] }> = [];
  for (const marketplace of wanted) {
    const draft = drafts.find((entry) => entry.marketplace === marketplace);
    if (draft?.status === "ready" || draft?.status === "approved") {
      await db.update(marketplaceDraftsTable).set({ status: "approved" }).where(eq(marketplaceDraftsTable.id, draft.id));
      approved.push(marketplace);
    } else notReady.push({ marketplace, status: draft?.status ?? "missing", stillNeeds: draft ? draft.missingFields.map((key) => draft.requiredFields.find((field) => field.key === key)?.label ?? key) : [] });
  }
  response.json({ approved, notReady });
});

router.post("/autopilot/items/:id/unapprove", async (request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  const updated = await db.update(marketplaceDraftsTable).set({ status: "ready" }).where(and(eq(marketplaceDraftsTable.userId, userId), eq(marketplaceDraftsTable.itemId, Number(request.params.id)), eq(marketplaceDraftsTable.status, "approved"))).returning({ marketplace: marketplaceDraftsTable.marketplace });
  response.json({ backToReady: updated.map((row) => row.marketplace) });
});

/** Same fields the Draft Board sends to the extension by hand (listings.tsx handoffDetails). */
function handoffDetails(item: typeof itemsTable.$inferSelect, draft: typeof marketplaceDraftsTable.$inferSelect): Record<string, string> {
  const details: Record<string, string> = {};
  const put = (key: string, value: unknown) => { if (value !== null && value !== undefined && String(value).trim() !== "") details[key] = String(value).trim(); };
  put("brand", item.brand); put("category", item.category); put("size", item.size); put("color", item.color);
  put("condition", item.condition); put("weight", item.weight); put("sku", item.sku);
  for (const [key, value] of Object.entries(item.marketplaceDetails ?? {})) if (typeof value !== "object") put(key, value);
  for (const field of draft.requiredFields ?? []) if (!["title", "description", "price", "photos"].includes(field.key)) put(field.key.replace(/^marketplaceDetails\./, ""), field.value);
  return details;
}

router.get("/autopilot/queue", async (_request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  const [draft] = await db.select().from(marketplaceDraftsTable).where(and(eq(marketplaceDraftsTable.userId, userId), eq(marketplaceDraftsTable.status, "approved"), inArray(marketplaceDraftsTable.marketplace, [...AUTO_POST_MARKETPLACES]))).orderBy(asc(marketplaceDraftsTable.updatedAt)).limit(1);
  if (!draft) { response.json({ next: null }); return; }
  const [item] = await db.select().from(itemsTable).where(and(eq(itemsTable.id, draft.itemId), eq(itemsTable.userId, userId)));
  if (!item) { response.json({ next: null }); return; }
  const photos = (item.photoRecords.length ? item.photoRecords.map((photo) => (photo.active === "processed" && photo.processed ? photo.processed : photo.original)) : item.photos).slice(0, MAX_STORED_PHOTOS);
  response.json({
    next: {
      itemId: item.id, draftId: draft.id, marketplace: draft.marketplace, title: draft.title ?? item.title, description: draft.description ?? "",
      tags: draft.tags, price: draft.price, details: handoffDetails(item, draft), photoCount: photos.length, photoNotice: "", photos,
    },
  });
});

const resultBody = z.object({ ok: z.boolean(), url: z.string().url().optional(), message: z.string().max(500).optional() });
router.post("/autopilot/drafts/:id/result", async (request, response): Promise<void> => {
  const parsed = resultBody.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Send ok (true or false), and the listing link when it posted." }); return; }
  const userId = getAuthenticatedUser(response).id;
  const [draft] = await db.update(marketplaceDraftsTable).set(parsed.data.ok
    ? { status: "published", publishedAt: new Date(), externalUrl: parsed.data.url ?? null }
    : { status: "needs_attention" }).where(and(eq(marketplaceDraftsTable.id, Number(request.params.id)), eq(marketplaceDraftsTable.userId, userId))).returning();
  if (!draft) { response.status(404).json({ error: "Draft not found" }); return; }
  // Keep the extension's message on the item, so "Needs attention" says why.
  const [item] = await db.select({ marketplaceDetails: itemsTable.marketplaceDetails }).from(itemsTable).where(and(eq(itemsTable.id, draft.itemId), eq(itemsTable.userId, userId)));
  if (item) {
    const details = (item.marketplaceDetails ?? {}) as Record<string, unknown>;
    const log = (details.autopostLog && typeof details.autopostLog === "object" ? details.autopostLog : {}) as Record<string, unknown>;
    await db.update(itemsTable).set({
      marketplaceDetails: { ...details, autopostLog: { ...log, [draft.marketplace]: { ok: parsed.data.ok, message: parsed.data.message ?? "", url: parsed.data.url ?? null, at: new Date().toISOString() } } },
      ...(parsed.data.ok ? { status: "active" } : {}),
    }).where(and(eq(itemsTable.id, draft.itemId), eq(itemsTable.userId, userId)));
  }
  response.json({ id: draft.id, status: draft.status });
});

export default router;
