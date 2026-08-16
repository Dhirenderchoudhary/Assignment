import { ApiError, handler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { pool, queryOne } from "@/lib/db";
import { getUserRank } from "@/lib/leaderboard";
import { MAX_CLICKS_PER_SECOND, calculateScore, type GameModeId } from "@/lib/modes";
import { finishGameSchema } from "@/lib/validation";

/** The run may finish this early (timer jitter) or this late (network, tab throttling). */
const EARLY_TOLERANCE_MS = 1_500;
const LATE_TOLERANCE_MS = 30_000;

type SessionRow = {
  id: string;
  user_id: number;
  mode: GameModeId;
  duration_ms: number;
  started_at: string;
  submitted_at: string | null;
};

/**
 * POST /api/game/finish: validate a completed run, score it, and store it.
 *
 * Everything a client sends is untrusted, so the ticket is checked four ways:
 * ownership, single-use, elapsed server time, and a plausible click rate.
 */
export const POST = handler(async (request: Request) => {
  const user = await requireUser();
  const { sessionId, clicks } = finishGameSchema.parse(await readJson(request));

  const client = await pool().connect();
  try {
    await client.query("BEGIN");

    // Lock the ticket so two concurrent submits can't both pass the
    // "not yet submitted" check and write two scores for one run.
    const { rows } = await client.query<SessionRow>(
      `SELECT id, user_id, mode, duration_ms, started_at, submitted_at
         FROM game_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId],
    );
    const session = rows[0];

    if (!session || session.user_id !== user.id) {
      throw new ApiError(404, "Unknown game session.");
    }
    if (session.submitted_at) {
      throw new ApiError(409, "That run has already been submitted.");
    }

    const elapsedMs = Date.now() - Date.parse(session.started_at);
    if (elapsedMs < session.duration_ms - EARLY_TOLERANCE_MS) {
      throw new ApiError(400, "That run finished too early to be valid.");
    }
    if (elapsedMs > session.duration_ms + LATE_TOLERANCE_MS) {
      throw new ApiError(408, "That run timed out before it was submitted.");
    }

    const maxClicks = Math.ceil((session.duration_ms / 1000) * MAX_CLICKS_PER_SECOND);
    if (clicks > maxClicks) {
      throw new ApiError(422, "That click rate isn't humanly possible.");
    }

    const score = calculateScore(clicks, session.duration_ms);

    await client.query(`UPDATE game_sessions SET submitted_at = now() WHERE id = $1`, [sessionId]);
    const { rows: inserted } = await client.query<{ id: number; created_at: string }>(
      `INSERT INTO scores (user_id, session_id, mode, clicks, duration_ms, score)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [user.id, sessionId, session.mode, clicks, session.duration_ms, score],
    );

    await client.query("COMMIT");

    // Read-only follow-ups, outside the transaction.
    const previousBest = await queryOne<{ best: number }>(
      `SELECT COALESCE(MAX(score), 0)::int AS best
         FROM scores WHERE user_id = $1 AND mode = $2 AND id <> $3`,
      [user.id, session.mode, inserted[0].id],
    );

    const [globalRank, dailyRank] = await Promise.all([
      getUserRank(user.id, session.mode, "global"),
      getUserRank(user.id, session.mode, "daily"),
    ]);

    return json(
      {
        result: {
          id: inserted[0].id,
          mode: session.mode,
          clicks,
          score,
          durationMs: session.duration_ms,
          cps: Number((clicks / (session.duration_ms / 1000)).toFixed(2)),
          createdAt: inserted[0].created_at,
          isPersonalBest: score > (previousBest?.best ?? 0),
          previousBest: previousBest?.best ?? 0,
        },
        ranks: { global: globalRank, daily: dailyRank },
      },
      201,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});
