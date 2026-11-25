import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, userProfilesTable } from "@workspace/db";
import { getAuthenticatedUser, requireAuth } from "../lib/auth";
import { createAgentKey, MAX_AGENT_KEYS, publicKeys, revokeAgentKey, withoutKeyHashes } from "../lib/agent-keys";

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

  response.json(withoutKeyHashes(profile));
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

  response.json(withoutKeyHashes(profile));
});

// Access keys for Hermes and the extension's auto-post mode. Managing keys needs the seller's
// own login: a program holding a key cannot create more keys or revoke the seller's.
const fromBrowserLogin = (response: import("express").Response) => getAuthenticatedUser(response).via !== "agent_key";

router.get("/agent-keys", async (_request, response): Promise<void> => {
  const user = getAuthenticatedUser(response);
  const [profile] = await db.select({ settings: userProfilesTable.settings }).from(userProfilesTable).where(eq(userProfilesTable.id, user.id));
  response.json({ keys: publicKeys(profile?.settings), max: MAX_AGENT_KEYS });
});

router.post("/agent-keys", async (request, response): Promise<void> => {
  if (!fromBrowserLogin(response)) { response.status(403).json({ error: "Create access keys from CrossLinkOS Settings while signed in." }); return; }
  const parsed = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Give the key a name, for example Hermes on my laptop." }); return; }
  const result = await createAgentKey(getAuthenticatedUser(response).id, parsed.data.name);
  if ("error" in result) { response.status(400).json({ error: result.error }); return; }
  response.status(201).json(result);
});

router.delete("/agent-keys/:id", async (request, response): Promise<void> => {
  if (!fromBrowserLogin(response)) { response.status(403).json({ error: "Revoke access keys from CrossLinkOS Settings while signed in." }); return; }
  const removed = await revokeAgentKey(getAuthenticatedUser(response).id, String(request.params.id));
  if (!removed) { response.status(404).json({ error: "That key was not found. It may already be revoked." }); return; }
  response.json({ ok: true });
});

export default router;
