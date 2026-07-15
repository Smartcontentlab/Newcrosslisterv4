import { Router, type IRouter } from "express";
import { eq, and, type SQL } from "drizzle-orm";
import { db, listingsTable, itemsTable } from "@workspace/db";
import {
  ListListingsQueryParams,
  CreateListingBody,
  CreateListingResponse,
  GetListingParams,
  GetListingResponse,
  UpdateListingParams,
  UpdateListingBody,
  UpdateListingResponse,
  DeleteListingParams,
  ListListingsResponse,
  GetListingHealthParams,
  GetListingHealthResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function enrichListings(rows: typeof listingsTable.$inferSelect[]) {
  if (rows.length === 0) return [];
  const itemIds = [...new Set(rows.map((r) => r.itemId))];
  const items = await db
    .select({ id: itemsTable.id, title: itemsTable.title })
    .from(itemsTable)
    .where(
      itemIds.length === 1
        ? eq(itemsTable.id, itemIds[0])
        : eq(itemsTable.id, itemIds[0]) // simplified; will match first
    );

  // Fetch all at once more safely
  const allItems = await db.select({ id: itemsTable.id, title: itemsTable.title }).from(itemsTable);
  const itemMap = new Map(allItems.map((i) => [i.id, i.title]));

  return rows.map((listing) => ({
    ...listing,
    itemTitle: itemMap.get(listing.itemId) ?? null,
  }));
}

router.get("/listings", async (req, res): Promise<void> => {
  const query = ListListingsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: SQL[] = [];
  if (query.data.itemId) conditions.push(eq(listingsTable.itemId, query.data.itemId));
  if (query.data.marketplace) conditions.push(eq(listingsTable.marketplace, query.data.marketplace));
  if (query.data.status) conditions.push(eq(listingsTable.status, query.data.status));

  const rows = await db
    .select()
    .from(listingsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(listingsTable.createdAt);

  const enriched = await enrichListings(rows);
  res.json(ListListingsResponse.parse(enriched));
});

router.post("/listings", async (req, res): Promise<void> => {
  const parsed = CreateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [listing] = await db.insert(listingsTable).values(parsed.data).returning();
  const enriched = await enrichListings([listing]);
  res.status(201).json(CreateListingResponse.parse(enriched[0]));
});

router.get("/listings/:id", async (req, res): Promise<void> => {
  const params = GetListingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, params.data.id));

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const enriched = await enrichListings([listing]);
  res.json(GetListingResponse.parse(enriched[0]));
});

router.patch("/listings/:id", async (req, res): Promise<void> => {
  const params = UpdateListingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [listing] = await db
    .update(listingsTable)
    .set(parsed.data)
    .where(eq(listingsTable.id, params.data.id))
    .returning();

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const enriched = await enrichListings([listing]);
  res.json(UpdateListingResponse.parse(enriched[0]));
});

router.delete("/listings/:id", async (req, res): Promise<void> => {
  const params = DeleteListingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [listing] = await db
    .delete(listingsTable)
    .where(eq(listingsTable.id, params.data.id))
    .returning();

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/listings/:id/health", async (req, res): Promise<void> => {
  const params = GetListingHealthParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, params.data.id));

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const [item] = await db
    .select()
    .from(itemsTable)
    .where(eq(itemsTable.id, listing.itemId));

  // Calculate health score based on listing quality
  const factors = [
    {
      name: "Title quality",
      score: listing.title && listing.title.length >= 40 ? 20 : listing.title ? 12 : 0,
      maxScore: 20,
      passed: !!(listing.title && listing.title.length >= 40),
    },
    {
      name: "Description completeness",
      score: listing.description && listing.description.length >= 100 ? 20 : listing.description ? 10 : 0,
      maxScore: 20,
      passed: !!(listing.description && listing.description.length >= 100),
    },
    {
      name: "Photos",
      score: item && item.photos.length >= 3 ? 20 : item && item.photos.length > 0 ? 10 : 0,
      maxScore: 20,
      passed: !!(item && item.photos.length >= 3),
    },
    {
      name: "Pricing",
      score: listing.price > 0 ? 20 : 0,
      maxScore: 20,
      passed: listing.price > 0,
    },
    {
      name: "Keywords & tags",
      score: item && item.tags.length >= 3 ? 20 : item && item.tags.length > 0 ? 10 : 0,
      maxScore: 20,
      passed: !!(item && item.tags.length >= 3),
    },
  ];

  const score = factors.reduce((sum, f) => sum + f.score, 0);
  let grade = "F";
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 60) grade = "D";

  const tips: string[] = [];
  if (!factors[0].passed) tips.push("Improve your title — aim for 40+ characters with keywords");
  if (!factors[1].passed) tips.push("Write a detailed description (100+ characters) to convert more buyers");
  if (!factors[2].passed) tips.push("Add at least 3 high-quality photos to build buyer trust");
  if (!factors[3].passed) tips.push("Set a competitive price based on recently sold comparables");
  if (!factors[4].passed) tips.push("Add 3+ relevant tags to improve search visibility");

  res.json(
    GetListingHealthResponse.parse({
      id: listing.id,
      score,
      grade,
      factors,
      tips,
    })
  );
});

export default router;
