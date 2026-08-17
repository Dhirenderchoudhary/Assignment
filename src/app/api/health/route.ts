import { json } from "@/lib/api";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Which kind of host DATABASE_URL points at. Supabase publishes two: the
 * direct `db.<ref>.supabase.co` host, which now only has an AAAA record, and
 * the pooler, which is reachable over IPv4. Serverless platforms are IPv4, so
 * the direct host fails to connect from them no matter how correct the
 * password is — the single most common way this deployment breaks.
 */
function describeHost(url: string) {
  try {
    const { hostname, port } = new URL(url);
    const kind = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(hostname)
      ? "localhost"
      : hostname.includes(".pooler.supabase.com")
        ? "supabase-pooler"
        : hostname.endsWith(".supabase.co")
          ? "supabase-direct"
          : "other";
    return { kind, port: port || "5432" };
  } catch {
    return { kind: "unparseable", port: null };
  }
}

/**
 * Deployment check. Reports whether the two things the app cannot start
 * without are actually present: a reachable database with the schema applied,
 * and a signing key long enough to be usable.
 *
 * Every other route answers a failed database connection with the same opaque
 * 500, which is correct for players but useless when a fresh deployment is
 * down and the cause could equally be an unset variable, an unreachable host,
 * a rejected password or a database with no tables in it. This distinguishes
 * them, and names the fix for each.
 *
 * It reports shape only: which category of host, the port, and the failing
 * error code. Never the connection string, the hostname, the credentials or
 * the driver's message, since that text carries the host and user name.
 */
export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;

  const checks = {
    database_url_set: Boolean(databaseUrl),
    auth_secret_valid: (process.env.AUTH_SECRET?.length ?? 0) >= 32,
    database_reachable: false,
    schema_applied: false,
  };

  const connection = databaseUrl ? describeHost(databaseUrl) : null;
  let errorCode: string | null = null;

  if (databaseUrl) {
    try {
      const row = await queryOne<{ scores: number }>(
        `SELECT COUNT(*)::int AS scores FROM scores`,
      );
      checks.database_reachable = true;
      checks.schema_applied = row !== null;
    } catch (error) {
      // A connection failure and a missing table both land here. The error
      // code tells them apart: 42P01 is "undefined_table", which means we
      // reached Postgres fine and the migration simply hasn't been run.
      errorCode = (error as { code?: string }).code ?? "UNKNOWN";
      checks.database_reachable = errorCode === "42P01";
      console.error("[health] database check failed", error);
    }
  }

  const ok = Object.values(checks).every(Boolean);

  return json(
    {
      ok,
      checks,
      connection,
      error_code: errorCode,
      hint: ok ? undefined : hintFor(checks, connection, errorCode),
    },
    ok ? 200 : 503,
  );
}

function hintFor(
  checks: Record<string, boolean>,
  connection: { kind: string; port: string | null } | null,
  errorCode: string | null,
): string {
  if (!checks.database_url_set) return "DATABASE_URL is not set in this environment.";

  if (!checks.database_reachable) {
    switch (connection?.kind) {
      case "localhost":
        return "DATABASE_URL points at localhost, which on a serverless host means the function itself. Replace it with the deployed database's connection string.";
      case "supabase-direct":
        return "DATABASE_URL uses Supabase's direct host (db.<ref>.supabase.co), which resolves to IPv6 only and is unreachable from IPv4 serverless functions. Switch to the transaction pooler: Project Settings -> Database -> Connection string -> Transaction pooler, host *.pooler.supabase.com on port 6543.";
      case "unparseable":
        return "DATABASE_URL is not a valid connection URL. Expected postgresql://user:password@host:port/database, with any special characters in the password percent-encoded.";
    }
    if (errorCode === "28P01")
      return "The host answered but rejected the password. Reset the database password and set DATABASE_URL again, percent-encoding any special characters in it.";
    if (errorCode === "ENOTFOUND")
      return "The database hostname does not resolve. Check it for a typo.";
    if (errorCode === "ETIMEDOUT")
      return "The connection timed out rather than being refused, which usually means a firewall or IP allow-list is dropping it.";
    return `The database host did not accept the connection (${errorCode}). Verify the host, port and password in DATABASE_URL.`;
  }

  if (!checks.schema_applied)
    return "Connected, but the tables are missing. Run: DATABASE_URL='<prod-url>' npm run db:migrate";

  return "AUTH_SECRET is missing or shorter than 32 characters.";
}
