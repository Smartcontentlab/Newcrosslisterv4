import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, userProfilesTable } from "@workspace/db";

/**
 * Access keys let a helper program (Hermes on the seller's laptop, the Chrome extension's
 * auto-post mode) use the API without the seller's browser login.
 *
 * Format: clos_<user id without dashes>_<secret>. The user id lets the server load one
 * profile instead of scanning every key. Only a SHA-256 hash of the secret is stored, in the
 * profile's settings (no new table), and the full key is shown to the seller once.
 */

export type StoredAgentKey = { id: string; name: string; hash: string; hint: string; createdAt: string; lastUsedAt?: string };
export type PublicAgentKey = Omit<StoredAgentKey, "hash">;

export const MAX_AGENT_KEYS = 5;
const KEY_PATTERN = /^clos_([0-9a-f]{32})_([A-Za-z0-9_-]{30,80})$/;
const LAST_USED_WRITE_MS = 60 * 60_000; // record use at most hourly, so every API call is not also a write

const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");
const toUuid = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

export const isAgentKey = (token: string) => token.startsWith("clos_");

export function storedKeys(settings: unknown): StoredAgentKey[] {
  const keys = (settings as { agentKeys?: unknown } | null)?.agentKeys;
  return Array.isArray(keys) ? keys.filter((key): key is StoredAgentKey => Boolean(key && typeof key === "object" && typeof (key as StoredAgentKey).hash === "string")) : [];
}

export const publicKeys = (settings: unknown): PublicAgentKey[] => storedKeys(settings).map(({ hash: _hash, ...rest }) => rest);

/** Profile settings as the browser should see them: key hashes are never sent out. */
export function withoutKeyHashes<T extends { settings?: unknown }>(profile: T): T {
  if (!profile.settings || typeof profile.settings !== "object") return profile;
  const { agentKeys: _agentKeys, ...settings } = profile.settings as Record<string, unknown>;
  return { ...profile, settings };
}

async function loadSettings(userId: string) {
  const [profile] = await db.select({ settings: userProfilesTable.settings }).from(userProfilesTable).where(eq(userProfilesTable.id, userId));
  return profile ? (profile.settings as Record<string, unknown>) : null;
}

async function saveKeys(userId: string, settings: Record<string, unknown>, keys: StoredAgentKey[]) {
  await db.update(userProfilesTable).set({ settings: { ...settings, agentKeys: keys } as never, updatedAt: new Date() }).where(eq(userProfilesTable.id, userId));
}

export async function createAgentKey(userId: string, name: string): Promise<{ key: string; record: PublicAgentKey } | { error: string }> {
  const settings = await loadSettings(userId);
  if (!settings) return { error: "Profile not found" };
  const keys = storedKeys(settings);
  if (keys.length >= MAX_AGENT_KEYS) return { error: `You already have ${MAX_AGENT_KEYS} access keys. Revoke one you no longer use first.` };
  const secret = randomBytes(30).toString("base64url");
  const record: StoredAgentKey = { id: randomUUID(), name: name.trim().slice(0, 60) || "Access key", hash: hashSecret(secret), hint: secret.slice(-4), createdAt: new Date().toISOString() };
  await saveKeys(userId, settings, [...keys, record]);
  const { hash: _hash, ...publicRecord } = record;
  return { key: `clos_${userId.replace(/-/g, "")}_${secret}`, record: publicRecord };
}

export async function revokeAgentKey(userId: string, keyId: string): Promise<boolean> {
  const settings = await loadSettings(userId);
  if (!settings) return false;
  const keys = storedKeys(settings);
  const remaining = keys.filter((key) => key.id !== keyId);
  if (remaining.length === keys.length) return false;
  await saveKeys(userId, settings, remaining);
  return true;
}

/** Returns the user id the key belongs to, or null for a wrong, revoked or malformed key. */
export async function verifyAgentKey(token: string): Promise<{ userId: string; keyId: string } | null> {
  const match = KEY_PATTERN.exec(token);
  if (!match) return null;
  const userId = toUuid(match[1]);
  const settings = await loadSettings(userId);
  if (!settings) return null;
  const keys = storedKeys(settings);
  const wanted = Buffer.from(hashSecret(match[2]), "hex");
  const found = keys.find((key) => {
    const stored = Buffer.from(key.hash, "hex");
    return stored.length === wanted.length && timingSafeEqual(stored, wanted);
  });
  if (!found) return null;
  if (!found.lastUsedAt || Date.now() - Date.parse(found.lastUsedAt) > LAST_USED_WRITE_MS) {
    await saveKeys(userId, settings, keys.map((key) => (key.id === found.id ? { ...key, lastUsedAt: new Date().toISOString() } : key))).catch(() => undefined);
  }
  return { userId, keyId: found.id };
}
