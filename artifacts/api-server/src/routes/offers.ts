/**
 * Offers & Sales inbox.
 *
 *   POST  /offers/sync        the extension reports what it read on Poshmark or Depop (offers + sales)
 *   GET   /offers             everything the inbox page shows: open offers per item, sales to act on
 *   PATCH /offers/:id         dismiss / un-dismiss a row
 *   POST  /offers/:id/item    tie an unmatched sale to an item (records the sale)
 *
 * Read only towards the marketplaces: nothing here accepts, counters or messages anyone. A sale the
 * extension sees on one site is recorded as an order, which marks the item sold and queues the
 * delist task for the other site (same as recording it by hand on the Orders page).
 */
import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  itemsTable,
  marketplaceDraftsTable,
  marketplaceOffersTable,
  MARKETPLACE_OFFERS_DDL,
  ordersTable,
  shippingTasksTable,
} from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { enqueueDelistingTasksForSale } from "../lib/marketplace-workflow";
import { DEFAULT_SHIPPING_STEPS } from "./orders";
import { estimateFees, listingKey, titleFromSlug, titleMatch } from "../lib/offer-match";

const router: IRouter = Router();

let tableReady: Promise<void> | null = null;
/** The table is created on first use, so no manual database step is needed after deploying. */
export function ensureOffersTable(): Promise<void> {
  tableReady ??= db.execute(sql.raw(MARKETPLACE_OFFERS_DDL)).then(() => undefined).catch((error) => { tableReady = null; throw error; });
  return tableReady;
}

const MARKETPLACES = ["poshmark", "depop"] as const;

const Entry = z.object({
  key: z.string().max(300).optional(),
  listingUrl: z.string().max(600).optional(),
  listingTitle: z.string().max(300).optional(),
  amount: z.number().nonnegative().max(100_000),
  buyer: z.string().max(120).optional(),
  detail: z.string().max(300).optional(),
});
const SyncBody = z.object({
  marketplace: z.enum(MARKETPLACES),
  /** True only when the offers page was read in full: then offers no longer showing are marked gone. */
  offersComplete: z.boolean().default(false),
  offers: z.array(Entry).max(300).default([]),
  sales: z.array(Entry).max(300).default([]),
});
type EntryInput = z.infer<typeof Entry>;

const entryKey = (entry: EntryInput) =>
  (entry.key?.trim() || [listingKey(entry.listingUrl) ?? entry.listingTitle?.toLowerCase().trim() ?? "", entry.buyer?.toLowerCase() ?? "", entry.amount].join("|")).slice(0, 300);

async function itemMatcher(userId: string, marketplace: string) {
  const [drafts, items] = await Promise.all([
    db.select({ itemId: marketplaceDraftsTable.itemId, marketplace: marketplaceDraftsTable.marketplace, externalUrl: marketplaceDraftsTable.externalUrl, externalListingId: marketplaceDraftsTable.externalListingId, title: marketplaceDraftsTable.title })
      .from(marketplaceDraftsTable).where(eq(marketplaceDraftsTable.userId, userId)),
    db.select({ id: itemsTable.id, title: itemsTable.title, status: itemsTable.status }).from(itemsTable).where(eq(itemsTable.userId, userId)),
  ]);
  const byKey = new Map<string, number>();
  for (const draft of drafts) {
    const key = listingKey(draft.externalUrl) ?? draft.externalListingId?.toLowerCase() ?? null;
    if (key) byKey.set(key, draft.itemId);
  }
  const titled = [
    ...items.map((item) => ({ id: item.id, title: item.title })),
    ...drafts.filter((d) => d.marketplace === marketplace && d.title).map((d) => ({ id: d.itemId, title: d.title as string })),
  ];
  return (entry: EntryInput): number | null => {
    const key = listingKey(entry.listingUrl);
    if (key && byKey.has(key)) return byKey.get(key)!;
    if (!entry.listingTitle) return null;
    let best: { id: number; score: number } | null = null;
    for (const candidate of titled) {
      const score = titleMatch(entry.listingTitle, candidate.title);
      if (score >= 0.75 && (!best || score > best.score)) best = { id: candidate.id, score };
    }
    return best?.id ?? null;
  };
}

/** Records a sale as an order: item sold, shipping checklist, delist task for the other sites. */
async function recordSale(userId: string, itemId: number, marketplace: string, amount: number, buyer: string | null) {
  const [item] = await db.select({ id: itemsTable.id, cost: itemsTable.cost, status: itemsTable.status })
    .from(itemsTable).where(and(eq(itemsTable.id, itemId), eq(itemsTable.userId, userId)));
  if (!item) return null;
  const fees = estimateFees(marketplace, amount);
  const [order] = await db.insert(ordersTable).values({
    userId, itemId, marketplace, buyerName: buyer, salePrice: amount, fees, shippingCost: 0,
    profit: Math.round((amount - fees - item.cost) * 100) / 100, status: "awaiting_shipment",
    notes: "Recorded automatically from the marketplace's sales page (fees estimated).",
  }).returning();
  await db.insert(shippingTasksTable).values({ userId, orderId: order.id, steps: DEFAULT_SHIPPING_STEPS });
  await db.update(itemsTable).set({ status: "sold", soldPlatform: marketplace, soldAt: new Date() })
    .where(and(eq(itemsTable.id, itemId), eq(itemsTable.userId, userId)));
  await db.update(marketplaceDraftsTable).set({ status: "sold", soldAt: new Date() })
    .where(and(eq(marketplaceDraftsTable.itemId, itemId), eq(marketplaceDraftsTable.userId, userId), eq(marketplaceDraftsTable.marketplace, marketplace)));
  await enqueueDelistingTasksForSale({ userId, itemId, orderId: order.id, soldMarketplace: marketplace });
  return order;
}

router.post("/offers/sync", async (request, response): Promise<void> => {
  const parsed = SyncBody.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: parsed.error.message }); return; }
  await ensureOffersTable();
  const userId = getAuthenticatedUser(response).id;
  const { marketplace, offersComplete, offers, sales } = parsed.data;
  const match = await itemMatcher(userId, marketplace);
  const now = new Date();

  const existing = await db.select().from(marketplaceOffersTable)
    .where(and(eq(marketplaceOffersTable.userId, userId), eq(marketplaceOffersTable.marketplace, marketplace)));
  const existingByKey = new Map(existing.map((row) => [`${row.kind}:${row.externalKey}`, row]));
  // The first time sales are read for a site, they are history (sold before this feature): kept, never recorded.
  const firstSalesRead = !existing.some((row) => row.kind === "sale");

  const newOffers: { title: string; amount: number }[] = [];
  const newSales: { title: string; amount: number; recorded: boolean }[] = [];
  const seenOfferKeys = new Set<string>();

  for (const entry of offers) {
    const externalKey = entryKey(entry);
    seenOfferKeys.add(externalKey);
    const before = existingByKey.get(`offer:${externalKey}`);
    if (before) {
      await db.update(marketplaceOffersTable).set({
        lastSeenAt: now, amount: entry.amount, detail: entry.detail ?? before.detail,
        status: before.status === "gone" ? "open" : before.status, itemId: before.itemId ?? match(entry),
      }).where(eq(marketplaceOffersTable.id, before.id));
      continue;
    }
    await db.insert(marketplaceOffersTable).values({
      userId, marketplace, kind: "offer", externalKey, itemId: match(entry), listingUrl: entry.listingUrl ?? null,
      listingTitle: entry.listingTitle ?? null, amount: entry.amount, buyer: entry.buyer ?? null, detail: entry.detail ?? null,
      status: "open", firstSeenAt: now, lastSeenAt: now,
    }).onConflictDoNothing();
    newOffers.push({ title: entry.listingTitle ?? "an item", amount: entry.amount });
  }
  if (offersComplete) {
    const gone = existing.filter((row) => row.kind === "offer" && row.status === "open" && !seenOfferKeys.has(row.externalKey)).map((row) => row.id);
    if (gone.length) await db.update(marketplaceOffersTable).set({ status: "gone" }).where(inArray(marketplaceOffersTable.id, gone));
  }

  const RECENT_ON_FIRST_READ = 5; // newest sales on a first read stay visible to tie to an item
  for (const [index, raw] of sales.entries()) {
    // Depop's sold list often shows only a photo and price: read the title from the link's slug.
    const entry = { ...raw, listingTitle: raw.listingTitle || titleFromSlug(raw.listingUrl) || undefined };
    const externalKey = entryKey(raw);
    const before = existingByKey.get(`sale:${externalKey}`);
    const itemId = before?.itemId ?? match(entry);
    if (before && !(before.status === "history" && !before.orderId && (itemId || index < RECENT_ON_FIRST_READ))) {
      await db.update(marketplaceOffersTable).set({ lastSeenAt: now, listingTitle: before.listingTitle ?? entry.listingTitle ?? null }).where(eq(marketplaceOffersTable.id, before.id));
      continue;
    }
    // Unmatched sales: on a site's first read only the newest few are shown (older ones are history
    // from before CrossLinkOS). A sale matching an item CrossLinkOS still shows unsold is always recorded.
    let status = itemId ? "recorded" : (firstSalesRead || before) && index >= RECENT_ON_FIRST_READ ? "history" : "unmatched";
    let orderId: number | null = null;
    if (status === "recorded" && itemId) {
      const [item] = await db.select({ status: itemsTable.status }).from(itemsTable).where(and(eq(itemsTable.id, itemId), eq(itemsTable.userId, userId)));
      if (item?.status === "sold") status = "history"; // already recorded (by hand or earlier)
      else orderId = (await recordSale(userId, itemId, marketplace, entry.amount, entry.buyer ?? null))?.id ?? null;
    }
    if (before) {
      if (status === "history") { await db.update(marketplaceOffersTable).set({ lastSeenAt: now }).where(eq(marketplaceOffersTable.id, before.id)); continue; }
      await db.update(marketplaceOffersTable).set({ itemId, status, orderId, lastSeenAt: now, firstSeenAt: now, listingTitle: entry.listingTitle ?? before.listingTitle })
        .where(eq(marketplaceOffersTable.id, before.id));
    } else {
      await db.insert(marketplaceOffersTable).values({
        userId, marketplace, kind: "sale", externalKey, itemId, listingUrl: entry.listingUrl ?? null,
        listingTitle: entry.listingTitle ?? null, amount: entry.amount, buyer: entry.buyer ?? null, detail: entry.detail ?? null,
        status, orderId, firstSeenAt: now, lastSeenAt: now,
      }).onConflictDoNothing();
    }
    if (status !== "history") newSales.push({ title: entry.listingTitle ?? "an item", amount: entry.amount, recorded: status === "recorded" });
  }

  // Items that now have open offers on both sites: worth a look.
  const open = await db.select({ itemId: marketplaceOffersTable.itemId, marketplace: marketplaceOffersTable.marketplace }).from(marketplaceOffersTable)
    .where(and(eq(marketplaceOffersTable.userId, userId), eq(marketplaceOffersTable.kind, "offer"), eq(marketplaceOffersTable.status, "open")));
  const sites = new Map<number, Set<string>>();
  for (const row of open) if (row.itemId) sites.set(row.itemId, (sites.get(row.itemId) ?? new Set()).add(row.marketplace));
  const bothSites = [...sites.values()].filter((set) => set.size > 1).length;

  response.json({ ok: true, newOffers, newSales, bothSites, firstSalesRead });
});

router.get("/offers", async (_request, response): Promise<void> => {
  await ensureOffersTable();
  const userId = getAuthenticatedUser(response).id;
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const rows = await db.select().from(marketplaceOffersTable).where(and(
    eq(marketplaceOffersTable.userId, userId),
    or(
      and(eq(marketplaceOffersTable.kind, "offer"), ne(marketplaceOffersTable.status, "dismissed"), gte(marketplaceOffersTable.lastSeenAt, weekAgo)),
      and(eq(marketplaceOffersTable.kind, "sale"), inArray(marketplaceOffersTable.status, ["unmatched", "recorded"]), gte(marketplaceOffersTable.firstSeenAt, weekAgo)),
    ),
  )).orderBy(desc(marketplaceOffersTable.lastSeenAt));

  const itemIds = [...new Set(rows.map((row) => row.itemId).filter((id): id is number => Boolean(id)))];
  const items = itemIds.length ? await db.select({
    id: itemsTable.id, title: itemsTable.title, price: itemsTable.price, cost: itemsTable.cost, weight: itemsTable.weight,
    status: itemsTable.status, marketplaceDetails: itemsTable.marketplaceDetails,
  }).from(itemsTable).where(and(eq(itemsTable.userId, userId), inArray(itemsTable.id, itemIds))) : [];
  const drafts = itemIds.length ? await db.select({ itemId: marketplaceDraftsTable.itemId, marketplace: marketplaceDraftsTable.marketplace, price: marketplaceDraftsTable.price, externalUrl: marketplaceDraftsTable.externalUrl })
    .from(marketplaceDraftsTable).where(and(eq(marketplaceDraftsTable.userId, userId), inArray(marketplaceDraftsTable.itemId, itemIds))) : [];

  const syncs = await db.select({ marketplace: marketplaceOffersTable.marketplace, at: sql<string>`max(${marketplaceOffersTable.lastSeenAt})` })
    .from(marketplaceOffersTable).where(eq(marketplaceOffersTable.userId, userId)).groupBy(marketplaceOffersTable.marketplace);

  response.json({
    offers: rows,
    items: items.map((item) => {
      const details = item.marketplaceDetails as Record<string, unknown>;
      const floor = details.poshSmartSellMode === "minimum_price" ? Number(details.poshMinimumPrice) || null : null;
      return {
        id: item.id, title: item.title, price: item.price, cost: item.cost, weight: item.weight, status: item.status, floor,
        listings: drafts.filter((d) => d.itemId === item.id).map((d) => ({ marketplace: d.marketplace, price: d.price, url: d.externalUrl })),
      };
    }),
    lastRead: Object.fromEntries(syncs.map((s) => [s.marketplace, s.at])),
  });
});

router.patch("/offers/:id", async (request, response): Promise<void> => {
  const id = Number(request.params.id);
  const body = z.object({ status: z.enum(["dismissed", "open"]) }).safeParse(request.body);
  if (!Number.isInteger(id) || !body.success) { response.status(400).json({ error: "Send a status of dismissed or open." }); return; }
  await ensureOffersTable();
  const userId = getAuthenticatedUser(response).id;
  const [row] = await db.update(marketplaceOffersTable).set({ status: body.data.status })
    .where(and(eq(marketplaceOffersTable.id, id), eq(marketplaceOffersTable.userId, userId))).returning();
  if (!row) { response.status(404).json({ error: "Not found" }); return; }
  response.json(row);
});

router.post("/offers/:id/item", async (request, response): Promise<void> => {
  const id = Number(request.params.id);
  const body = z.object({ itemId: z.number().int().positive() }).safeParse(request.body);
  if (!Number.isInteger(id) || !body.success) { response.status(400).json({ error: "Pick an item." }); return; }
  await ensureOffersTable();
  const userId = getAuthenticatedUser(response).id;
  const [row] = await db.select().from(marketplaceOffersTable).where(and(eq(marketplaceOffersTable.id, id), eq(marketplaceOffersTable.userId, userId)));
  if (!row) { response.status(404).json({ error: "Not found" }); return; }
  if (row.kind === "sale" && row.status === "unmatched") {
    const order = await recordSale(userId, body.data.itemId, row.marketplace, row.amount, row.buyer);
    if (!order) { response.status(404).json({ error: "Item not found" }); return; }
    const [updated] = await db.update(marketplaceOffersTable).set({ itemId: body.data.itemId, status: "recorded", orderId: order.id })
      .where(eq(marketplaceOffersTable.id, id)).returning();
    response.json(updated); return;
  }
  const [updated] = await db.update(marketplaceOffersTable).set({ itemId: body.data.itemId }).where(eq(marketplaceOffersTable.id, id)).returning();
  response.json(updated);
});

export default router;
