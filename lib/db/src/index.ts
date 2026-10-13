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
 * Supabase only accepts TLS connections, and node-postgres does not enable TLS
 * from a connection string unless it carries `sslmode`.
 *
 * Its pooler presents a certificate from Supabase's own CA, which is not in
 * Node's trust store, so full verification fails with "self-signed certificate
 * in certificate chain". Encrypting without verifying the chain is what
 * `sslmode=require` means and is Supabase's documented default for pooled
 * connections. To verify properly, put Supabase's CA certificate (Project
 * Settings → Database → SSL configuration) in DATABASE_CA_CERT.
 */
const caCertificate = process.env.DATABASE_CA_CERT?.trim();
const urlSetsSslMode = /[?&]sslmode=/i.test(connectionString);

export const pool = new Pool({
  connectionString,
  ...(urlSetsSslMode
    ? {}
    : { ssl: caCertificate ? { ca: caCertificate } : { rejectUnauthorized: false } }),
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
