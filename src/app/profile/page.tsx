import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TimeAgo } from "@/components/TimeAgo";
import { currentUser } from "@/lib/auth";
import { formatDuration, formatNumber } from "@/lib/client";
import { PERIODS } from "@/lib/leaderboard";
import { GAME_MODES, type GameModeId, MODE_IDS } from "@/lib/modes";
import { getProfile } from "@/lib/stats";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

const PERIOD_LABELS = { global: "All time", daily: "Today", weekly: "This week" } as const;

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { stats, bests, history, ranks } = await getProfile(user.id, 20);
  const bestByMode = new Map(bests.map((best) => [best.mode, best]));

  return (
    <div className="flex flex-col gap-8 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            <span className="text-gradient">{user.username}</span>
          </h1>
          <p className="text-sm text-muted">
            Playing since{" "}
            {new Date(user.created_at).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <Link
          href="/"
          className="rounded-xl bg-gradient-to-r from-cyan to-violet px-5 py-2.5 text-sm font-bold text-void transition-transform hover:scale-105"
        >
          New run
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Games played" value={formatNumber(stats.games_played)} />
        <Stat label="Total clicks" value={formatNumber(stats.total_clicks)} accent="text-cyan" />
        <Stat label="Best score" value={formatNumber(stats.best_score)} accent="text-amber" />
        <Stat label="Average score" value={formatNumber(stats.avg_score)} />
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Personal bests
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {MODE_IDS.map((id) => {
            const mode = GAME_MODES[id];
            const best = bestByMode.get(id);
            return (
              <div key={id} className="panel p-5">
                <div className="flex items-baseline justify-between">
                  <span className="font-bold" style={{ color: mode.accent }}>
                    {mode.name}
                  </span>
                  <span className="text-xs text-muted">{formatDuration(mode.durationMs)}</span>
                </div>
                <div className="numeric mt-2 text-3xl font-black">
                  {best ? formatNumber(best.best_score) : "—"}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {best
                    ? `${formatNumber(best.best_clicks)} clicks · ${best.games} ${
                        best.games === 1 ? "game" : "games"
                      }`
                    : "Not played yet"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* A rankings grid full of dashes tells a new player nothing, so it only
          appears once there is something to rank. */}
      <section className={stats.games_played === 0 ? "hidden" : undefined}>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Rankings
        </h2>
        <div className="panel no-scrollbar overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted">
                <th scope="col" className="px-5 py-3 font-medium">
                  Board
                </th>
                {PERIODS.map((period) => (
                  <th key={period} scope="col" className="px-5 py-3 text-right font-medium">
                    {PERIOD_LABELS[period]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {([...MODE_IDS, "all"] as (GameModeId | "all")[]).map((mode) => (
                <tr key={mode}>
                  <th scope="row" className="px-5 py-3 text-left font-medium">
                    {mode === "all" ? "Combined" : GAME_MODES[mode].name}
                  </th>
                  {PERIODS.map((period) => {
                    const entry = ranks.find((r) => r.mode === mode && r.period === period);
                    return (
                      <td key={period} className="numeric px-5 py-3 text-right">
                        {entry?.rank ? (
                          <span>
                            <span className="font-bold text-ink">#{entry.rank}</span>
                            <span className="text-xs text-muted">
                              {" "}
                              / {formatNumber(entry.total_players ?? 0)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Recent games
        </h2>
        {history.length === 0 ? (
          <p className="panel px-6 py-12 text-center text-muted">
            No games yet.{" "}
            <Link href="/" className="text-cyan underline-offset-4 hover:underline">
              Play your first run
            </Link>
            .
          </p>
        ) : (
          <ol className="panel divide-y divide-border/60">
            {history.map((game) => (
              <li
                key={game.id}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40 sm:gap-4 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: GAME_MODES[game.mode]?.accent }}
                    >
                      {GAME_MODES[game.mode]?.name ?? game.mode}
                    </span>
                    <TimeAgo at={game.created_at} className="text-xs text-muted" />
                  </div>
                  <div className="truncate text-xs text-muted">
                    {formatNumber(game.clicks)} clicks in {formatDuration(game.duration_ms)} ·{" "}
                    {(game.clicks / (game.duration_ms / 1000)).toFixed(1)} cps
                  </div>
                </div>
                <span
                  className={`numeric shrink-0 text-right font-bold ${
                    game.score === stats.best_score ? "text-amber" : "text-ink"
                  }`}
                >
                  {formatNumber(game.score)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent = "text-ink" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="panel px-4 py-4">
      <div className={`numeric text-2xl font-black ${accent}`}>{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-widest text-muted">{label}</div>
    </div>
  );
}
