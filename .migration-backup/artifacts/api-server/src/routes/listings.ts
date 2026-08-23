import { Router, type IRouter } from "express";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import { db, itemsTable, listingsTable } from "@workspace/db";
import {
  CreateListingBody,
  CreateListingResponse,
  DeleteListingParams,
  GetListingHealthParams,
  GetListingHealthResponse,
  GetListingParams,
  GetListingResponse,
  ListListingsQueryParams,
  ListListingsResponse,
  UpdateListingBody,
  UpdateListingParams,
  UpdateListingResponse,
} from "@workspace/api-zod";
import { getAuthenticatedUser } from "../lib/auth";

const router: IRouter = Router();

async function enrichListings(rows: typeof listingsTable.$inferSelect[], userId: string) {
  if (rows.length === 0) return [];
  const itemIds = [...new Set(rows.map((row) => row.itemId))];
  const items = await db
    .select({ id: itemsTable.id, title: itemsTable.title })
    .from(itemsTable)
    .where(and(eq(itemsTable.userId, userId), inArray(itemsTable.id, itemIds)));
  const itemMap = new Map(items.map((item) => [item.id, item.title]));
  return rows.map((listing) => ({ ...listing, itemTitle: itemMap.get(listing.itemId) ?? null }));
}

router.get("/listings", async (request, response): Promise<void> => {
  const query = ListListingsQueryParams.safeParse(request.query);
  if (!query.success) {
    response.status(400).json({ error: query.error.message });
    return;
  }

  const userId = getAuthenticatedUser(response).id;
  const conditions: SQL[] = [eq(listingsTable.userId, userId)];
  if (query.data.itemId) conditions.push(eq(listingsTable.itemId, query.data.itemId));
  if (query.data.marketplace) conditions.push(eq(listingsTable.marketplace, query.data.marketplace));
  if (query.data.status) conditions.push(eq(listingsTable.status, query.data.status));

  const rows = await db.select().from(listingsTable).where(and(...conditions)).orderBy(listingsTable.createdAt);
  response.json(ListListingsResponse.parse(await enrichListings(rows, userId)));
});

router.post("/listings", async (request, response): Promise<void> => {
  const parsed = CreateListingBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getAuthenticatedUser(response).id;
  const [item] = await db
    .select({ id: itemsTable.id })
    .from(itemsTable)
    .where(and(eq(itemsTable.id, parsed.data.itemId), eq(itemsTable.userId, userId)));
  if (!item) {
    response.status(404).json({ error: "Item not found" });
    return;
  }

  const [listing] = await db.insert(listingsTable).values({ ...parsed.data, userId }).returning();
  response.status(201).json(CreateListingResponse.parse((await enrichListings([listing], userId))[0]));
});

router.get("/listings/:id", async (request, response): Promise<void> => {
  const params = GetListingParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: params.error.message });
    return;
  }

  const userId = getAuthenticatedUser(response).id;
  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(and(eq(listingsTable.id, params.data.id), eq(listingsTable.userId, userId)));
  if (!listing) {
    response.status(404).json({ error: "Listing not found" });
    return;
  }
  response.json(GetListingResponse.parse((await enrichListings([listing], userId))[0]));
});

router.patch("/listings/:id", async (request, response): Promise<void> => {
  const params = UpdateListingParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateListingBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getAuthenticatedUser(response).id;
  const [listing] = await db
    .update(listingsTable)
    .set(parsed.data)
    .where(and(eq(listingsTable.id, params.data.id), eq(listingsTable.userId, userId)))
    .returning();
  if (!listing) {
    response.status(404).json({ error: "Listing not found" });
    return;
  }
  response.json(UpdateListingResponse.parse((await enrichListings([listing], userId))[0]));
});

router.delete("/listings/:id", async (request, response): Promise<void> => {
  const params = DeleteListingParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: params.error.message });
    return;
  }

  const userId = getAuthenticatedUser(response).id;
  const [listing] = await db
    .delete(listingsTable)
    .where(and(eq(listingsTable.id, params.data.id), eq(listingsTable.userId, userId)))
    .returning();
  if (!listing) {
    response.status(404).json({ error: "Listing not found" });
    return;
  }
  response.sendStatus(204);
});

router.get("/listings/:id/health", async (request, response): Promise<void> => {
  const params = GetListingHealthParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: params.error.message });
    return;
  }

  const userId = getAuthenticatedUser(response).id;
  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(and(eq(listingsTable.id, params.data.id), eq(listingsTable.userId, userId)));
  if (!listing) {
    response.status(404).json({ error: "Listing not found" });
    return;
  }

  const [item] = await db
    .select()
    .from(itemsTable)
    .where(and(eq(itemsTable.id, listing.itemId), eq(itemsTable.userId, userId)));

  const factors = [
    { name: "Title quality", score: listing.title && listing.title.length >= 40 ? 20 : listing.title ? 12 : 0, maxScore: 20, passed: Boolean(listing.title && listing.title.length >= 40) },
    { name: "Description completeness", score: listing.description && listing.description.length >= 100 ? 20 : listing.description ? 10 : 0, maxScore: 20, passed: Boolean(listing.description && listing.description.length >= 100) },
    { name: "Photos", score: item && item.photos.length >= 3 ? 20 : item && item.photos.length > 0 ? 10 : 0, maxScore: 20, passed: Boolean(item && item.photos.length >= 3) },
    { name: "Pricing", score: listing.price > 0 ? 20 : 0, maxScore: 20, passed: listing.price > 0 },
    { name: "Keywords & tags", score: item && item.tags.length >= 3 ? 20 : item && item.tags.length > 0 ? 10 : 0, maxScore: 20, passed: Boolean(item && item.tags.length >= 3) },
  ];
  const score = factors.reduce((sum, factor) => sum + factor.score, 0);
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  const tips: string[] = [];
  if (!factors[0].passed) tips.push("Improve your title — aim for 40+ characters with keywords");
  if (!factors[1].passed) tips.push("Write a detailed description (100+ characters) to convert more buyers");
  if (!factors[2].passed) tips.push("Add at least 3 high-quality photos to build buyer trust");
  if (!factors[3].passed) tips.push("Set a competitive price based on recently sold comparables");
  if (!factors[4].passed) tips.push("Add 3+ relevant tags to improve search visibility");

  response.json(GetListingHealthResponse.parse({ id: listing.id, score, grade, factors, tips }));
});

export default router;
