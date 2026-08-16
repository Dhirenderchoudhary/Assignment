/**
 * Applies db/schema.sql. The schema is idempotent, so this doubles as the
 * "create" and the "keep up to date" step: `npm run db:migrate`.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
    process.exit(1);
  }

  const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);
  const client = new Client({
    connectionString,
    ssl:
      process.env.DATABASE_SSL === "false" || (isLocal && process.env.DATABASE_SSL !== "true")
        ? undefined
        : { rejectUnauthorized: false },
  });

  const schema = await readFile(path.join(process.cwd(), "db", "schema.sql"), "utf8");

  await client.connect();
  try {
    await client.query(schema);
    console.log("✓ Schema applied.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("✗ Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
