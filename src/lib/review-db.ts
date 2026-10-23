import "server-only";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
let pool: Pool | undefined;
export function reviewStorageConfigured() { return Boolean(process.env.DATABASE_URL?.trim()); }
export function reviewDatabase(): Pool {
  if (!reviewStorageConfigured()) throw new Error("Review storage is not configured.");
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 4000, query_timeout: 5000, allowExitOnIdle: true });
    pool.on("error", () => console.error("Review database connection error."));
    attachDatabasePool(pool);
  }
  return pool;
}
