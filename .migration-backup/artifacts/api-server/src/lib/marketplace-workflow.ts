import { and, eq, inArray } from "drizzle-orm";
import { db, delistingTasksTable, listingsTable, marketplaceDraftsTable } from "@workspace/db";

export const SUPPORTED_MARKETPLACES = ["poshmark", "depop", "mercari"] as const;
export type SupportedMarketplace = (typeof SUPPORTED_MARKETPLACES)[number];

export async function enqueueDelistingTasksForSale(input: {
  userId: string;
  itemId: number;
  orderId: number;
  soldMarketplace: string;
}) {
  const [listings, drafts, existing] = await Promise.all([
    db.select().from(listingsTable).where(and(
      eq(listingsTable.userId, input.userId),
      eq(listingsTable.itemId, input.itemId),
      eq(listingsTable.status, "active"),
    )),
    db.select().from(marketplaceDraftsTable).where(and(
      eq(marketplaceDraftsTable.userId, input.userId),
      eq(marketplaceDraftsTable.itemId, input.itemId),
    )),
    db.select().from(delistingTasksTable).where(and(
      eq(delistingTasksTable.userId, input.userId),
      eq(delistingTasksTable.itemId, input.itemId),
    )),
  ]);

  const pendingMarketplaces = new Map<string, number | null>();
  for (const listing of listings) {
    if (listing.marketplace !== input.soldMarketplace) pendingMarketplaces.set(listing.marketplace, null);
  }
  for (const draft of drafts) {
    if (draft.marketplace !== input.soldMarketplace && ["active", "published"].includes(draft.status)) {
      pendingMarketplaces.set(draft.marketplace, draft.id);
    }
  }

  const openTasks = new Set(existing.filter((task) => ["pending", "in_progress"].includes(task.status)).map((task) => task.marketplace));
  const tasksToInsert = Array.from(pendingMarketplaces.entries())
    .filter(([marketplace]) => !openTasks.has(marketplace))
    .map(([marketplace, marketplaceDraftId]) => ({
      userId: input.userId,
      itemId: input.itemId,
      orderId: input.orderId,
      marketplace,
      marketplaceDraftId,
      status: "pending",
      note: `Sold on ${input.soldMarketplace}. Remove this listing before shipment.`,
    }));

  if (tasksToInsert.length > 0) await db.insert(delistingTasksTable).values(tasksToInsert);

  const draftMarketplaces = drafts.map((draft) => draft.marketplace).filter((marketplace) => marketplace !== input.soldMarketplace);
  if (draftMarketplaces.length > 0) {
    await db.update(marketplaceDraftsTable).set({ status: "delisting" }).where(and(
      eq(marketplaceDraftsTable.userId, input.userId),
      eq(marketplaceDraftsTable.itemId, input.itemId),
      inArray(marketplaceDraftsTable.marketplace, draftMarketplaces),
    ));
  }
  await db.update(marketplaceDraftsTable).set({ status: "sold", soldAt: new Date() }).where(and(
    eq(marketplaceDraftsTable.userId, input.userId),
    eq(marketplaceDraftsTable.itemId, input.itemId),
    eq(marketplaceDraftsTable.marketplace, input.soldMarketplace),
  ));

  return tasksToInsert.length;
}
