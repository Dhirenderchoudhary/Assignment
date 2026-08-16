import { query, queryOne } from "./db";
import { type GameModeId, MODE_IDS } from "./modes";

export const PERIODS = ["global", "daily", "weekly"] as const;
export type Period = (typeof PERIODS)[number];

export function isPeriod(value: unknown): value is Period {
  return typeof value === "string" && (PERIODS as readonly string[]).includes(value);
}

export type LeaderboardRow = {
  rank: number;
  user_id: number;
  username: string;
  score: number;
  clicks: number;
  mode: GameModeId;
  duration_ms: number;
  achieved_at: string;
};

/**
 * SQL fragment for the time window of a period. `global` has no lower bound;
 * `daily`/`weekly` are rolling windows, which keeps the boards continuously
 * meaningful rather than resetting to empty at midnight.
 */
function windowClause(period: Period): string {
  switch (period) {
    case "daily":
      return `AND s.created_at >= now() - INTERVAL '1 day'`;
    case "weekly":
      return `AND s.created_at >= now() - INTERVAL '7 days'`;
    case "global":
      return "";
  }
}

/**
 * Top players for a mode + period.
 *
 * A leaderboard ranks *players*, not runs, so a player who has played 500
 * times must not fill the whole board. `DISTINCT ON (s.user_id)` collapses
 * each player to their single best run in the window (ties broken by whoever
 * got there first), and the outer query ranks those bests.
 */
export async function getLeaderboard(
  mode: GameModeId | "all",
  period: Period,
  limit = 25,
): Promise<LeaderboardRow[]> {
  const modes = mode === "all" ? MODE_IDS : [mode];

  return query<LeaderboardRow>(
    `
    WITH personal_best AS (
      SELECT DISTINCT ON (s.user_id)
             s.user_id, s.score, s.clicks, s.mode, s.duration_ms, s.created_at
        FROM scores s
       WHERE s.mode = ANY($1::text[])
             ${windowClause(period)}
       ORDER BY s.user_id, s.score DESC, s.created_at ASC
    )
    SELECT ROW_NUMBER() OVER (ORDER BY pb.score DESC, pb.created_at ASC)::int AS rank,
           pb.user_id,
           u.username,
           pb.score,
           pb.clicks,
           pb.mode,
           pb.duration_ms,
           pb.created_at AS achieved_at
      FROM personal_best pb
      JOIN users u ON u.id = pb.user_id
     ORDER BY pb.score DESC, pb.created_at ASC
     LIMIT $2
    `,
    [modes, limit],
  );
}

export type UserRank = { rank: number; score: number; total_players: number } | null;

/**
 * Where one player sits on a board, even if they're below the visible cut.
 * Returns `null` when the player has no qualifying run in the window.
 */
export async function getUserRank(
  userId: number,
  mode: GameModeId | "all",
  period: Period,
): Promise<UserRank> {
  const modes = mode === "all" ? MODE_IDS : [mode];

  return queryOne<NonNullable<UserRank>>(
    `
    WITH personal_best AS (
      SELECT DISTINCT ON (s.user_id)
             s.user_id, s.score, s.created_at
        FROM scores s
       WHERE s.mode = ANY($1::text[])
             ${windowClause(period)}
       ORDER BY s.user_id, s.score DESC, s.created_at ASC
    ),
    ranked AS (
      SELECT user_id,
             score,
             ROW_NUMBER() OVER (ORDER BY score DESC, created_at ASC)::int AS rank,
             COUNT(*) OVER ()::int AS total_players
        FROM personal_best
    )
    SELECT rank, score, total_players FROM ranked WHERE user_id = $2
    `,
    [modes, userId],
  );
}

/**
 * A cheap fingerprint of the current board state, used by the SSE stream to
 * decide whether anything actually changed before pushing an update.
 */
export async function getLeaderboardVersion(): Promise<string> {
  const row = await queryOne<{ version: string }>(
    `SELECT COALESCE(MAX(id), 0) || ':' || COUNT(*) AS version FROM scores`,
  );
  return row?.version ?? "0:0";
}
