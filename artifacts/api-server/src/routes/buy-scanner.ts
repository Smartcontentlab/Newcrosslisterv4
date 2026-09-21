import { Router, type IRouter, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, buyCandidatesTable, type BuyCandidateComp } from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";

const router: IRouter = Router();
const compSchema = z.object({
  title: z.string().min(1),
  price: z.number().min(0),
  soldAt: z.string().min(1),
  source: z.string().min(1),
});
const scanSchema = z.object({
  title: z.string().trim().min(1),
  brand: z.string().trim().optional(),
  category: z.string().trim().optional(),
  condition: z.string().trim().optional(),
  purchaseCost: z.number().min(0),
});
const candidateSchema = scanSchema.extend({
  recommendation: z.enum(["yes", "no"]),
  rationale: z.string().min(1),
  estimatedSalePrice: z.number().min(0),
  estimatedFees: z.number().min(0),
  projectedProfit: z.number(),
  confidence: z.enum(["low", "medium", "high"]),
  comps: z.array(compSchema).max(3),
});

function unavailable(response: Response) {
  response.status(502).json({
    error: "Sold comps are unavailable",
    code: "SOLD_COMPS_UNAVAILABLE",
    message: "Connect an approved sold-comps provider before making a buy decision.",
  });
}

router.post("/buy-scanner/evaluate", async (request, response): Promise<void> => {
  const parsed = scanSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // Keep this boundary explicit. We do not treat ordinary marketplace search as sold history.
  // A provider adapter can be added here once approved eBay sold-comps access is connected.
  unavailable(response);
});

router.get("/buy-scanner/candidates", async (_request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  response.json(await db.select().from(buyCandidatesTable).where(eq(buyCandidatesTable.userId, userId)).orderBy(desc(buyCandidatesTable.createdAt)));
});

router.post("/buy-scanner/candidates", async (request, response): Promise<void> => {
  const parsed = candidateSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const userId = getAuthenticatedUser(response).id;
  // `condition` is accepted by the scan schema but is not persisted on buy_candidates.
  const { condition: _condition, ...fields } = parsed.data;
  const [candidate] = await db.insert(buyCandidatesTable).values({
    ...fields,
    userId,
    brand: fields.brand || null,
    category: fields.category || null,
    comps: fields.comps as BuyCandidateComp[],
  }).returning();
  response.status(201).json(candidate);
});

router.delete("/buy-scanner/candidates/:id", async (request, response): Promise<void> => {
  const userId = getAuthenticatedUser(response).id;
  const [candidate] = await db.delete(buyCandidatesTable).where(and(eq(buyCandidatesTable.id, Number(request.params.id)), eq(buyCandidatesTable.userId, userId))).returning({ id: buyCandidatesTable.id });
  if (!candidate) {
    response.status(404).json({ error: "Shopping candidate not found" });
    return;
  }
  response.status(204).send();
});

export default router;