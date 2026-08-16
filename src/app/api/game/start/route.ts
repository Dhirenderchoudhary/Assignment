import { ApiError, handler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { getMode } from "@/lib/modes";
import { startGameSchema } from "@/lib/validation";

/**
 * POST /api/game/start: mint a session ticket for one playthrough.
 *
 * The timer the player sees is client-side (it has to be, for a responsive
 * UI), but the *authoritative* clock is `started_at` recorded here. The finish
 * endpoint checks the submitted run against it.
 */
export const POST = handler(async (request: Request) => {
  const user = await requireUser();
  const { mode } = startGameSchema.parse(await readJson(request));
  const { durationMs } = getMode(mode);

  const session = await queryOne<{ id: string; started_at: string }>(
    `INSERT INTO game_sessions (user_id, mode, duration_ms)
     VALUES ($1, $2, $3)
     RETURNING id, started_at`,
    [user.id, mode, durationMs],
  );
  if (!session) throw new ApiError(500, "Could not start the game.");

  return json({
    sessionId: session.id,
    mode,
    durationMs,
    startedAt: session.started_at,
  });
});
