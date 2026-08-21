import { Router, type IRouter } from "express";
import { and, eq, ilike, type SQL } from "drizzle-orm";
import { db, itemsTable, listingsTable } from "@workspace/db";
import {
  CreateItemBody,
  CreateItemResponse,
  DeleteItemParams,
  GetItemParams,
  GetItemResponse,
  ListItemsQueryParams,
  ListItemsResponse,
  ListStaleItemsResponse,
  UpdateItemBody,
  UpdateItemParams,
  UpdateItemResponse,
} from "@workspace/api-zod";
import { getAuthenticatedUser } from "../lib/auth";

const router: IRouter = Router();

router.get("/items", async (request, response): Promise<void> => {
  const query = ListItemsQueryParams.safeParse(request.query);
  if (!query.success) {
    response.status(400).json({ error: query.error.message });
    return;
  }

  const userId = getAuthenticatedUser(response).id;
  const conditions: SQL[] = [eq(itemsTable.userId, userId)];
  if (query.data.status) conditions.push(eq(itemsTable.status, query.data.status));
  if (query.data.category) conditions.push(eq(itemsTable.category, query.data.category));
  if (query.data.search) conditions.push(ilike(itemsTable.title, `%${query.data.search}%`));

  const items = await db
    .select()
    .from(itemsTable)
    .where(and(...conditions))
    .orderBy(itemsTable.createdAt);

  const activeListings = await db
    .select({ itemId: listingsTable.itemId })
    .from(listingsTable)
    .where(and(eq(listingsTable.userId, userId), eq(listingsTable.status, "active")));

  const countMap = new Map<number, number>();
  for (const row of activeListings) countMap.set(row.itemId, (countMap.get(row.itemId) ?? 0) + 1);

  response.json(ListItemsResponse.parse(items.map((item) => ({ ...item, listingCount: countMap.get(item.id) ?? 0 }))));
});

router.post("/items", async (request, response): Promise<void> => {
  const parsed = CreateItemBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getAuthenticatedUser(response).id;
  const [item] = await db.insert(itemsTable).values({ ...parsed.data, userId }).returning();
  response.status(201).json(CreateItemResponse.parse({ ...item, listingCount: 0 }));
});

router.get("/items/stale", async (_request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - 30);

  const items = await db
    .select()
    .from(itemsTable)
    .where(and(eq(itemsTable.userId, userId), eq(itemsTable.status, "active")))
    .orderBy(itemsTable.createdAt);

  const stale = items
    .filter((item) => new Date(item.createdAt) < threshold)
    .map((item) => ({ ...item, listingCount: 0 }));
  response.json(ListStaleItemsResponse.parse(stale));
});

router.get("/items/:id", async (request, response): Promise<void> => {
  const params = GetItemParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: params.error.message });
    return;
  }

  const userId = getAuthenticatedUser(response).id;
  const [item] = await db
    .select()
    .from(itemsTable)
    .where(and(eq(itemsTable.id, params.data.id), eq(itemsTable.userId, userId)));
  if (!item) {
    response.status(404).json({ error: "Item not found" });
    return;
  }

  const activeListings = await db
    .select({ id: listingsTable.id })
    .from(listingsTable)
    .where(and(eq(listingsTable.itemId, item.id), eq(listingsTable.userId, userId), eq(listingsTable.status, "active")));

  response.json(GetItemResponse.parse({ ...item, listingCount: activeListings.length }));
});

router.patch("/items/:id", async (request, response): Promise<void> => {
  const params = UpdateItemParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateItemBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getAuthenticatedUser(response).id;
  const [item] = await db
    .update(itemsTable)
    .set(parsed.data)
    .where(and(eq(itemsTable.id, params.data.id), eq(itemsTable.userId, userId)))
    .returning();
  if (!item) {
    response.status(404).json({ error: "Item not found" });
    return;
  }
  response.json(UpdateItemResponse.parse({ ...item, listingCount: 0 }));
});

router.delete("/items/:id", async (request, response): Promise<void> => {
  const params = DeleteItemParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: params.error.message });
    return;
  }

  const userId = getAuthenticatedUser(response).id;
  const [item] = await db
    .delete(itemsTable)
    .where(and(eq(itemsTable.id, params.data.id), eq(itemsTable.userId, userId)))
    .returning();
  if (!item) {
    response.status(404).json({ error: "Item not found" });
    return;
  }
  response.sendStatus(204);
});

export default router;
