import { createServerClient } from "@supabase/ssr";
import type { cookies } from "next/headers";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/**
 * Supabase client for server components and route handlers.
 *
 * Pass the store from `await cookies()` rather than reading it in here, so the
 * caller decides which request's cookies apply.
 *
 * See the note in `./client.ts`: the game's own reads and writes go through
 * `src/lib/db.ts`, not this client.
 */
export function createClient(cookieStore: CookieStore) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components get a read-only cookie store. Writes are
            // expected to fail here and are safe to ignore.
          }
        },
      },
    },
  );
}
