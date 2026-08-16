import { query, queryOne } from "./db";
import { type Period, PERIODS, getUserRank } from "./leaderboard";
import { type GameModeId, MODE_IDS } from "./modes";

export type PlayerStats = {
  games_played: number;
  total_clicks: number;
  best_score: number;
  avg_score: number;
};

export type ModeBest = {
  mode: GameModeId;
  best_score: number;
  best_clicks: number;
  games: number;
};

export type HistoryEntry = {
  id: number;
  mode: GameModeId;
  clicks: number;
  score: number;
  duration_ms: number;
  created_at: string;
};

export type RankEntry = {
  period: Period;
  mode: GameModeId | "all";
  rank: number | null;
  total_players: number | null;
};

export type Profile = {
  stats: PlayerStats;
  bests: ModeBest[];
  history: HistoryEntry[];
  ranks: RankEntry[];
};

const EMPTY_STATS: PlayerStats = {
  games_played: 0,
  total_clicks: 0,
  best_score: 0,
  avg_score: 0,
};

export async function getProfile(userId: number, historyLimit = 20): Promise<Profile> {
  const [stats, bests, history, ranks] = await Promise.all([
    queryOne<PlayerStats>(
      `SELECT COUNT(*)::int                       AS games_played,
              COALESCE(SUM(clicks), 0)::int       AS total_clicks,
              COALESCE(MAX(score), 0)::int        AS best_score,
              COALESCE(ROUND(AVG(score)), 0)::int AS avg_score
         FROM scores
        WHERE user_id = $1`,
      [userId],
    ),

    getModeBests(userId),

    query<HistoryEntry>(
      `SELECT id, mode, clicks, score, duration_ms, created_at
         FROM scores
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, historyLimit],
    ),

    getAllRanks(userId),
  ]);

  return { stats: stats ?? EMPTY_STATS, bests, history, ranks };
}

/**
 * One row per mode the player has ever finished a run in. The game screen uses
 * this on its own to show the score you're chasing, so it stays a single query
 * rather than something only reachable through the full profile.
 */
export function getModeBests(userId: number): Promise<ModeBest[]> {
  return query<ModeBest>(
    `SELECT mode,
            MAX(score)::int  AS best_score,
            MAX(clicks)::int AS best_clicks,
            COUNT(*)::int    AS games
       FROM scores
      WHERE user_id = $1
      GROUP BY mode`,
    [userId],
  );
}

/** The player's standing on every period x mode board, plus the combined board. */
async function getAllRanks(userId: number): Promise<RankEntry[]> {
  const boards = PERIODS.flatMap((period) =>
    [...MODE_IDS, "all" as const].map((mode) => ({ period, mode })),
  );

  return Promise.all(
    boards.map(async ({ period, mode }) => {
      const rank = await getUserRank(userId, mode, period);
      return {
        period,
        mode,
        rank: rank?.rank ?? null,
        total_players: rank?.total_players ?? null,
      };
    }),
  );
}
