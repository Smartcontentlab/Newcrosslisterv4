import { Router, type IRouter } from "express";
import { eq, ilike, and, type SQL } from "drizzle-orm";
import { db, itemsTable, listingsTable } from "@workspace/db";
import {
  ListItemsQueryParams,
  CreateItemBody,
  CreateItemResponse,
  GetItemParams,
  GetItemResponse,
  UpdateItemParams,
  UpdateItemBody,
  UpdateItemResponse,
  DeleteItemParams,
  ListItemsResponse,
  ListStaleItemsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/items", async (req, res): Promise<void> => {
  const query = ListItemsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: SQL[] = [];
  if (query.data.status) conditions.push(eq(itemsTable.status, query.data.status));
  if (query.data.category) conditions.push(eq(itemsTable.category, query.data.category));
  if (query.data.search) conditions.push(ilike(itemsTable.title, `%${query.data.search}%`));

  const items = await db
    .select()
    .from(itemsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(itemsTable.createdAt);

  // Add listing count per item
  const listingCounts = await db
    .select({ itemId: listingsTable.itemId })
    .from(listingsTable)
    .where(eq(listingsTable.status, "active"));

  const countMap = new Map<number, number>();
  for (const row of listingCounts) {
    countMap.set(row.itemId, (countMap.get(row.itemId) ?? 0) + 1);
  }

  const result = items.map((item) => ({
    ...item,
    listingCount: countMap.get(item.id) ?? 0,
  }));

  res.json(ListItemsResponse.parse(result));
});

router.post("/items", async (req, res): Promise<void> => {
  const parsed = CreateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db.insert(itemsTable).values(parsed.data).returning();
  res.status(201).json(CreateItemResponse.parse({ ...item, listingCount: 0 }));
});

router.get("/items/stale", async (_req, res): Promise<void> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const items = await db
    .select()
    .from(itemsTable)
    .where(eq(itemsTable.status, "active"))
    .orderBy(itemsTable.createdAt);

  // Filter items that have been active for 30+ days without being sold
  const stale = items.filter(
    (item) => new Date(item.createdAt) < thirtyDaysAgo
  );

  const result = stale.map((item) => ({ ...item, listingCount: 0 }));
  res.json(ListStaleItemsResponse.parse(result));
});

router.get("/items/:id", async (req, res): Promise<void> => {
  const params = GetItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, params.data.id));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const listings = await db
    .select({ id: listingsTable.id })
    .from(listingsTable)
    .where(and(eq(listingsTable.itemId, item.id), eq(listingsTable.status, "active")));

  res.json(GetItemResponse.parse({ ...item, listingCount: listings.length }));
});

router.patch("/items/:id", async (req, res): Promise<void> => {
  const params = UpdateItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .update(itemsTable)
    .set(parsed.data)
    .where(eq(itemsTable.id, params.data.id))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  res.json(UpdateItemResponse.parse({ ...item, listingCount: 0 }));
});

router.delete("/items/:id", async (req, res): Promise<void> => {
  const params = DeleteItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await db
    .delete(itemsTable)
    .where(eq(itemsTable.id, params.data.id))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
