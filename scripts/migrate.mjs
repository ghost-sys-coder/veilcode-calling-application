import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import pg from "pg";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DIRECT_DATABASE_URL or DATABASE_URL before migrating.");
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15000 });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(await readFile(new URL("../migrations/001_call_reviews.sql", import.meta.url), "utf8"));
  await client.query("COMMIT");
  console.log("Call review schema is ready.");
} catch {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Migration failed. Check database connectivity and permissions; credentials were not logged.");
  process.exitCode = 1;
} finally { await client.end(); }
