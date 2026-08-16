import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for browser code.
 *
 * Note that ClickRush's own data path does not go through this. Scores,
 * leaderboards and sessions are served by the API routes in `src/app/api`,
 * which reach Postgres directly through `src/lib/db.ts` so the ranking SQL can
 * be written by hand. This client is here for Supabase-hosted features that
 * sit outside that path (storage, realtime channels, edge functions).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
