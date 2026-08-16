import { handler, json } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { getLeaderboard, getUserRank } from "@/lib/leaderboard";
import { leaderboardQuerySchema } from "@/lib/validation";

/**
 * GET /api/leaderboard?mode=classic&period=global&limit=25
 *
 * `mode` accepts any mode id or `all`; `period` is global | daily | weekly.
 * When the caller is signed in, their own standing is included even if they
 * fall below the returned slice.
 */
export const GET = handler(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const { mode, period, limit } = leaderboardQuerySchema.parse({
    mode: searchParams.get("mode") ?? undefined,
    period: searchParams.get("period") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  const user = await currentUser();
  const [entries, you] = await Promise.all([
    getLeaderboard(mode, period, limit),
    user ? getUserRank(user.id, mode, period) : Promise.resolve(null),
  ]);

  return json({ mode, period, entries, you });
});
