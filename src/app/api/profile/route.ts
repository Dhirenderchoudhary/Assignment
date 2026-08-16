import { handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/stats";

/**
 * GET /api/profile?limit=20
 * Stats, per-mode bests, leaderboard standings and recent history for the
 * signed-in player.
 */
export const GET = handler(async (request: Request) => {
  const user = await requireUser();
  const requested = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 20;

  return json({ user, ...(await getProfile(user.id, limit)) });
});
