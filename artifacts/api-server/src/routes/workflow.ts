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

const router: IRouter = Router();

const itemStatus = z.enum(["draft", "active", "sold", "archived"]);
const condition = z.enum(["new", "like_new", "good", "fair", "poor"]);
const marketplace = z.enum(SUPPORTED_MARKETPLACES);
const photoRecord = z.object({
  id: z.string(),
  original: z.string(),
  processed: z.string().nullable().optional(),
  active: z.enum(["original", "processed"]),
  processingStatus: z.enum(["original", "processing", "processed", "failed"]),
  name: z.string().optional(),
  createdAt: z.string(),
});

const canonicalItemBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  category: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  measurements: z.string().optional(),
  sku: z.string().optional(),
  notes: z.string().optional(),
  sourceLocation: z.string().optional(),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  condition: condition.default("good"),
  status: itemStatus.default("draft"),
  price: z.number().min(0).default(0),
  cost: z.number().min(0).default(0),
  weight: z.number().min(0).optional(),
  photos: z.array(z.string()).default([]),
  photoRecords: z.array(photoRecord).default([]),
  tags: z.array(z.string()).default([]),
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
  poshmark: [
    { key: "brand", label: "Brand" }, { key: "category", label: "Category" }, { key: "size", label: "Size" },
    { key: "condition", label: "Condition" }, { key: "color", label: "Color" }, { key: "price", label: "List price" },
  ],
  depop: [
    { key: "brand", label: "Brand" }, { key: "category", label: "Category" }, { key: "size", label: "Size" },
    { key: "condition", label: "Condition" }, { key: "price", label: "List price" }, { key: "photos", label: "At least one photo" },
  ],
  mercari: [
    { key: "brand", label: "Brand" }, { key: "category", label: "Category" }, { key: "condition", label: "Condition" },
    { key: "price", label: "List price" }, { key: "photos", label: "At least one photo" },
  ],
};

function extractJson(content: string): Record<string, unknown> | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}

async function callNim(system: string, prompt: string, maxTokens = 800) {
  const key = process.env.NVIDIA_NIM_API_KEY;
  if (!key) throw new Error("NVIDIA NIM is not configured");
  const base = (process.env.NVIDIA_NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
  const model = process.env.NVIDIA_NIM_MODEL ?? "nvidia/nemotron-3.5-lightning-30b-a3b";
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.35, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
  });
  if (!response.ok) throw new Error(`NVIDIA NIM returned ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content ?? "";
}

function itemValue(item: typeof itemsTable.$inferSelect, key: string): string | number | boolean | null {
  if (key === "photos") return item.photoRecords.length > 0 || item.photos.length > 0;
  if (key === "price") return item.price;
  return (item as unknown as Record<string, string | number | boolean | null>)[key] ?? null;
}

function fallbackContent(item: typeof itemsTable.$inferSelect, platform: string) {
  const descriptor = [item.condition.replaceAll("_", " "), item.brand, item.color, item.title].filter(Boolean).join(" · ");
  const platformLine = platform === "poshmark" ? "Bundle-friendly and ready to ship." : platform === "depop" ? "Styled for discovery with clear condition details." : "Carefully packed and shipped with care.";
  return {
    title: [item.brand, item.color, item.title, item.size ? `Size ${item.size}` : ""].filter(Boolean).join(" ").slice(0, 80),
    description: `${descriptor}\n\n${item.description || "Clean, accurately described resale item."}\n\nDetails: ${[item.category, item.size && `Size ${item.size}`, item.color, item.condition.replaceAll("_", " ")].filter(Boolean).join(" · ")}\n\n${platformLine}`,
    tags: Array.from(new Set([item.brand, item.category, item.color, item.size, ...item.tags].filter(Boolean))).slice(0, 8),
  };
}

async function createDraftContent(item: typeof itemsTable.$inferSelect, platform: string) {
  const fallback = fallbackContent(item, platform);
  try {
    const content = await callNim(
      "You write accurate resale listings. Return only JSON with title, description, and tags. Do not invent measurements, flaws, brand, size, condition, or platform policies.",
      `Create a concise ${platform} resale listing from this item. Item data: ${JSON.stringify({ title: item.title, description: item.description, brand: item.brand, category: item.category, size: item.size, color: item.color, condition: item.condition, tags: item.tags, price: item.price })}`,
      700,
    );
    const parsed = extractJson(content);
    return {
      title: typeof parsed?.title === "string" && parsed.title.trim() ? parsed.title.slice(0, 80) : fallback.title,
      description: typeof parsed?.description === "string" && parsed.description.trim() ? parsed.description : fallback.description,
      tags: Array.isArray(parsed?.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 10) : fallback.tags,
      usedFallback: !parsed,
    };
  } catch {
    return { ...fallback, usedFallback: true };
  }
}

router.get("/workflow/items", async (_req, res): Promise<void> => {
  const items = await db.select().from(itemsTable).orderBy(desc(itemsTable.updatedAt));
  res.json(items);
});

router.post("/workflow/items", async (req, res): Promise<void> => {
  const parsed = canonicalItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const data = { ...parsed.data, sourceUrl: parsed.data.sourceUrl || null };
  const [item] = await db.insert(itemsTable).values(data).returning();
  res.status(201).json(item);
});

router.get("/workflow/items/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, id));
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  const drafts = await db.select().from(marketplaceDraftsTable).where(eq(marketplaceDraftsTable.itemId, id));
  const delistingTasks = await db.select().from(delistingTasksTable).where(eq(delistingTasksTable.itemId, id));
  res.json({ item, drafts, delistingTasks });
});

router.patch("/workflow/items/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = patchCanonicalItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const data = { ...parsed.data, sourceUrl: parsed.data.sourceUrl || null };
  const [item] = await db.update(itemsTable).set(data).where(eq(itemsTable.id, id)).returning();
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  res.json(item);
});

router.post("/workflow/items/:id/ai-assist", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, id));
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  const fallback = {
    title: [item.brand, item.color, item.title, item.size ? `Size ${item.size}` : ""].filter(Boolean).join(" ").slice(0, 100),
    description: item.description || `Pre-owned ${item.condition.replaceAll("_", " ")} ${item.title}.`,
    tags: Array.from(new Set([item.brand, item.category, item.color, item.size, ...item.tags].filter(Boolean))).slice(0, 10),
    confidence: "Needs seller review",
    usedFallback: true,
  };
  try {
    const content = await callNim(
      "You assist resale sellers. Return only JSON with title, description, tags, category, color, size, and confidence. Preserve uncertain fields as empty strings. Do not claim you analyzed an image when image data is not provided.",
      `Suggest editable listing fields from this seller-entered data: ${JSON.stringify({ title: item.title, description: item.description, brand: item.brand, category: item.category, size: item.size, color: item.color, condition: item.condition, measurements: item.measurements, tags: item.tags })}`,
      700,
    );
    const parsed = extractJson(content);
    res.json({
      title: typeof parsed?.title === "string" ? parsed.title : fallback.title,
      description: typeof parsed?.description === "string" ? parsed.description : fallback.description,
      tags: Array.isArray(parsed?.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 10) : fallback.tags,
      category: typeof parsed?.category === "string" ? parsed.category : item.category,
      color: typeof parsed?.color === "string" ? parsed.color : item.color,
      size: typeof parsed?.size === "string" ? parsed.size : item.size,
      confidence: typeof parsed?.confidence === "string" ? parsed.confidence : "Seller review required",
      usedFallback: !parsed,
    });
  } catch {
    res.json(fallback);
  }
});

router.post("/workflow/items/:id/marketplace-drafts", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, id));
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  const drafts = [];
  for (const platform of SUPPORTED_MARKETPLACES) {
    const content = await createDraftContent(item, platform);
    const requirements = draftRequirements[platform].map((field) => ({ ...field, required: true, value: itemValue(item, field.key) }));
    const missingFields = requirements.filter((field) => field.value === null || field.value === "" || field.value === false || field.value === 0).map((field) => field.key);
    const status = missingFields.length === 0 ? "ready" : "draft";
    const [draft] = await db.insert(marketplaceDraftsTable).values({
      itemId: item.id,
      marketplace: platform,
      status,
      title: content.title,
      description: content.description,
      tags: content.tags,
      price: item.price,
      requiredFields: requirements,
      missingFields,
    }).onConflictDoUpdate({
      target: [marketplaceDraftsTable.itemId, marketplaceDraftsTable.marketplace],
      set: { status, title: content.title, description: content.description, tags: content.tags, price: item.price, requiredFields: requirements, missingFields },
    }).returning();
    drafts.push({ ...draft, usedFallback: content.usedFallback });
  }
  res.json(drafts);
});

router.get("/workflow/items/:id/marketplace-drafts", async (req, res): Promise<void> => {
  const drafts = await db.select().from(marketplaceDraftsTable).where(eq(marketplaceDraftsTable.itemId, Number(req.params.id)));
  res.json(drafts);
});

router.patch("/workflow/marketplace-drafts/:id", async (req, res): Promise<void> => {
  const parsed = z.object({ status: z.string().optional(), title: z.string().optional(), description: z.string().optional(), tags: z.array(z.string()).optional(), price: z.number().min(0).optional(), externalListingId: z.string().optional(), externalUrl: z.string().url().optional().or(z.literal("")) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const [draft] = await db.update(marketplaceDraftsTable).set({ ...parsed.data, externalUrl: parsed.data.externalUrl || null }).where(eq(marketplaceDraftsTable.id, Number(req.params.id))).returning();
  if (!draft) { res.status(404).json({ error: "Marketplace draft not found" }); return; }
  res.json(draft);
});

router.post("/workflow/items/:id/mark-sold", async (req, res): Promise<void> => {
  const itemId = Number(req.params.id);
  const parsed = z.object({ marketplace, salePrice: z.number().min(0), fees: z.number().min(0).optional(), shippingCost: z.number().min(0).optional(), buyerName: z.string().optional(), trackingNumber: z.string().optional(), notes: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, itemId));
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  const sourceDraft = await db.select().from(marketplaceDraftsTable).where(and(eq(marketplaceDraftsTable.itemId, itemId), eq(marketplaceDraftsTable.marketplace, parsed.data.marketplace)));
  const profit = parsed.data.salePrice - item.cost - (parsed.data.fees ?? 0) - (parsed.data.shippingCost ?? 0);
  const [order] = await db.insert(ordersTable).values({ itemId, listingId: null, marketplace: parsed.data.marketplace, buyerName: parsed.data.buyerName, salePrice: parsed.data.salePrice, fees: parsed.data.fees ?? 0, shippingCost: parsed.data.shippingCost ?? 0, profit, status: "awaiting_shipment", trackingNumber: parsed.data.trackingNumber, notes: parsed.data.notes }).returning();
  await db.insert(shippingTasksTable).values({ orderId: order.id, steps: DEFAULT_SHIPPING_STEPS });
  await db.update(itemsTable).set({ status: "sold", soldPlatform: parsed.data.marketplace, soldAt: new Date() }).where(eq(itemsTable.id, itemId));
  if (sourceDraft[0]) await db.update(marketplaceDraftsTable).set({ status: "sold", soldAt: new Date() }).where(eq(marketplaceDraftsTable.id, sourceDraft[0].id));
  const queued = await enqueueDelistingTasksForSale({ itemId, orderId: order.id, soldMarketplace: parsed.data.marketplace });
  res.status(201).json({ order, delistingTasksQueued: queued, fulfillmentStatus: "awaiting_shipment" });
});

router.get("/workflow/delisting-tasks", async (_req, res): Promise<void> => {
  const tasks = await db.select().from(delistingTasksTable).orderBy(desc(delistingTasksTable.createdAt));
  const items = await db.select({ id: itemsTable.id, title: itemsTable.title }).from(itemsTable);
  const itemMap = new Map(items.map((item) => [item.id, item.title]));
  res.json(tasks.map((task) => ({ ...task, itemTitle: itemMap.get(task.itemId) ?? "Unknown item" })));
});

router.patch("/workflow/delisting-tasks/:id", async (req, res): Promise<void> => {
  const parsed = z.object({ status: z.enum(["pending", "in_progress", "completed", "failed"]), note: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const [task] = await db.update(delistingTasksTable).set({ status: parsed.data.status, note: parsed.data.note, completedAt: parsed.data.status === "completed" ? new Date() : null }).where(eq(delistingTasksTable.id, Number(req.params.id))).returning();
  if (!task) { res.status(404).json({ error: "Delisting task not found" }); return; }
  if (task.marketplaceDraftId && parsed.data.status === "completed") {
    await db.update(marketplaceDraftsTable).set({ status: "delisted" }).where(eq(marketplaceDraftsTable.id, task.marketplaceDraftId));
  }
  if (parsed.data.status === "completed") {
    await db.update(listingsTable).set({ status: "ended" }).where(and(eq(listingsTable.itemId, task.itemId), eq(listingsTable.marketplace, task.marketplace)));
  }
  res.json(task);
});

export default router;
