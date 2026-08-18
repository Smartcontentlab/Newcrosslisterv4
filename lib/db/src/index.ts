import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const netlifyRuntime = (globalThis as typeof globalThis & {
  Netlify?: { env?: { get(name: string): string | undefined } };
}).Netlify;
const databaseUrl = process.env.DATABASE_URL ?? netlifyRuntime?.env?.get("DATABASE_URL");

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });

export * from "./schema";
