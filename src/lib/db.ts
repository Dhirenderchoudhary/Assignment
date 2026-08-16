import pg, { Pool, type QueryResultRow } from "pg";

// node-postgres hands back BIGINT as a string (it can't fit every int8 in a
// JS number) and TIMESTAMPTZ as a Date. Neither matches what the rest of the
// app expects: ids get compared with === against numbers, and timestamps
// cross the server/client boundary where only the JSON form survives. Ids
// here are sequence values that will never approach 2^53, so normalise both
// once at the driver instead of converting at every call site.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value) => new Date(value).toISOString());

/**
 * A single pooled Postgres connection, cached on `globalThis` so Next.js's dev
 * server doesn't leak a new pool on every hot reload.
 */
declare global {
  var __clickrushPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at a Postgres instance.",
    );
  }

  // Hosted Postgres (Neon, Supabase, RDS…) requires TLS; a local docker
  // instance does not. Opt out explicitly with DATABASE_SSL=false.
  const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);
  const ssl =
    process.env.DATABASE_SSL === "false" || (isLocal && process.env.DATABASE_SSL !== "true")
      ? undefined
      : { rejectUnauthorized: false };

  return new Pool({ connectionString, ssl, max: 10, idleTimeoutMillis: 30_000 });
}

export function pool(): Pool {
  globalThis.__clickrushPool ??= createPool();
  return globalThis.__clickrushPool;
}

/** Run a parameterised query and return all rows. */
export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool().query<T>(text, params);
  return result.rows;
}

/** Run a parameterised query and return the first row, or `null`. */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
