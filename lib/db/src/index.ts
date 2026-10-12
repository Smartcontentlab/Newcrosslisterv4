import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * Supabase only accepts TLS connections. node-postgres does not enable TLS from
 * a connection string unless it carries `sslmode`, so turn it on explicitly when
 * the URL is silent. Certificates are still verified — Supabase's pooler uses a
 * publicly trusted CA — so this adds encryption without weakening it.
 */
const urlSetsSslMode = /[?&]sslmode=/i.test(connectionString);

export const pool = new Pool({
  connectionString,
  ...(urlSetsSslMode ? {} : { ssl: true }),
});

/**
 * Drizzle reports a failed query as "Failed query: select …" and drops the
 * reason, which makes a bad password look identical to a refused TLS handshake.
 * Logging the driver's own error keeps that detail.
 */
pool.on("error", (error: Error & { code?: string }) => {
  console.error(`[db] pool error${error.code ? ` (${error.code})` : ""}: ${error.message}`);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
