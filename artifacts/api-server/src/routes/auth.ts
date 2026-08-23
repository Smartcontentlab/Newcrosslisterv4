import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, userProfilesTable } from "@workspace/db";
import { getAuthenticatedUser, requireAuth } from "../lib/auth";

const router: IRouter = Router();

const updateProfileBody = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  settings: z.object({
    timezone: z.string().trim().max(80).optional(),
    defaultCurrency: z.string().trim().max(12).optional(),
    defaultShippingOrigin: z.string().trim().max(160).optional(),
    notifications: z.object({
      email: z.boolean().optional(),
      inApp: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

router.use(requireAuth);

router.get("/auth/me", async (_request, response): Promise<void> => {
  const user = getAuthenticatedUser(response);
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, user.id));

  if (!profile) {
    response.status(404).json({ error: "Your CrossLinkOS profile is still being created. Please try again shortly." });
    return;
  }

  response.json(profile);
});

router.patch("/auth/me", async (request, response): Promise<void> => {
  const parsed = updateProfileBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = getAuthenticatedUser(response);
  const [existing] = await db
    .select({ settings: userProfilesTable.settings })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, user.id));

  if (!existing) {
    response.status(404).json({ error: "Profile not found" });
    return;
  }

  const [profile] = await db
    .update(userProfilesTable)
    .set({
      ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
      ...(parsed.data.settings !== undefined ? { settings: { ...existing.settings, ...parsed.data.settings } } : {}),
      updatedAt: new Date(),
    })
    .where(eq(userProfilesTable.id, user.id))
    .returning();

  response.json(profile);
});

export default router;
