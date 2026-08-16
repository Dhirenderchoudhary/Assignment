import { json } from "@/lib/api";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Deployment check. Reports whether the two things the app cannot start
 * without are actually present: a reachable database with the schema applied,
 * and a signing key long enough to be usable.
 *
 * Every other route answers a failed database connection with the same opaque
 * 500, which is correct for players but useless when a fresh deployment is
 * down and the cause could equally be an unset variable, an unreachable host
 * or a database with no tables in it. This distinguishes them.
 *
 * It reports presence and shape only. No connection string, no key material,
 * and no driver error text, since that can carry the host and user name.
 */
export async function GET() {
  const checks = {
    database_url_set: Boolean(process.env.DATABASE_URL),
    auth_secret_valid: (process.env.AUTH_SECRET?.length ?? 0) >= 32,
    database_reachable: false,
    schema_applied: false,
  };

  if (checks.database_url_set) {
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
      const code = (error as { code?: string }).code;
      checks.database_reachable = code === "42P01";
      console.error("[health] database check failed", error);
    }
  }

  const ok = Object.values(checks).every(Boolean);

  return json(
    {
      ok,
      checks,
      hint: ok
        ? undefined
        : !checks.database_url_set
          ? "DATABASE_URL is not set in this environment."
          : !checks.database_reachable
            ? "DATABASE_URL is set but the host refused the connection. Check the value, and use Supabase's transaction pooler on port 6543 rather than the direct host."
            : !checks.schema_applied
              ? "Connected, but the tables are missing. Run: DATABASE_URL='<prod-url>' npm run db:migrate"
              : "AUTH_SECRET is missing or shorter than 32 characters.",
    },
    ok ? 200 : 503,
  );
}
