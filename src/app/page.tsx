import Link from "next/link";
import { GameArena } from "@/components/GameArena";
import { currentUser } from "@/lib/auth";
import { getLeaderboard, getUserRank } from "@/lib/leaderboard";
import { formatNumber } from "@/lib/client";
import { GAME_MODES, type GameModeId, MODE_IDS } from "@/lib/modes";
import { getModeBests } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await currentUser();
  if (user) return <PlayScreen userId={user.id} username={user.username} />;
  return <LandingScreen />;
}

/** The signed-in view: the game, plus the context that makes a run mean something. */
async function PlayScreen({ userId, username }: { userId: number; username: string }) {
  const [bests, todaysRank] = await Promise.all([
    getModeBests(userId),
    getUserRank(userId, "all", "daily"),
  ]);

  const bestByMode = Object.fromEntries(
    bests.map((best) => [best.mode, best.best_score]),
  ) as Partial<Record<GameModeId, number>>;

  return (
    <div className="flex flex-col gap-6 py-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Go, <span className="text-gradient">{username}</span>
          </h1>
          <p className="text-sm text-muted">
            {bests.length === 0
              ? "First run sets the bar. Pick a mode."
              : "Pick a mode and beat your best."}
          </p>
        </div>

        {todaysRank && (
          <Link
            href="/leaderboard?period=daily&mode=all"
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-muted hover:text-ink"
          >
            Today you&apos;re{" "}
            <strong className="numeric text-ink">#{todaysRank.rank}</strong> of{" "}
            {formatNumber(todaysRank.total_players)}
          </Link>
        )}
      </header>

      <GameArena bests={bestByMode} />
    </div>
  );
}

/** The signed-out view: what the game is, and proof people are playing it. */
async function LandingScreen() {
  const top = await getLeaderboard("classic", "global", 5).catch(() => []);

  return (
    <div className="flex flex-col gap-14 py-12 sm:gap-16 sm:py-16">
      <section className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan">
          60 seconds. One button.
        </p>
        <h1 className="mt-4 text-balance text-4xl font-black tracking-tight sm:text-6xl md:text-7xl">
          How fast are <span className="text-gradient">your fingers?</span>
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-balance text-muted">
          Click as many times as you can before the clock hits zero. Every run is scored,
          ranked and thrown onto the global, daily and weekly boards.
        </p>

        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="rounded-xl bg-gradient-to-r from-cyan to-violet px-7 py-3.5 font-bold text-void transition-transform hover:scale-105"
          >
            Play now
          </Link>
          <Link
            href="/leaderboard"
            className="rounded-xl border border-border px-7 py-3.5 text-center font-semibold text-muted transition-colors hover:border-muted hover:text-ink"
          >
            View leaderboard
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.25em] text-muted">
          Three ways to play
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {MODE_IDS.map((id) => {
            const mode = GAME_MODES[id];
            return (
              <div
                key={id}
                className="panel p-5 transition-colors hover:border-muted/40"
                style={{ borderTopColor: mode.accent, borderTopWidth: 2 }}
              >
                <div className="text-lg font-bold" style={{ color: mode.accent }}>
                  {mode.name}
                </div>
                <div className="numeric mt-1 text-3xl font-black text-ink">
                  {mode.durationMs / 1000}s
                </div>
                <p className="mt-2 text-sm text-muted">{mode.tagline}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          Scores are normalised to clicks per 60 seconds, so every mode lands on the same board.
        </p>
      </section>

      {top.length > 0 && (
        <section>
          <h2 className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.25em] text-muted">
            Current Classic leaders
          </h2>
          <ol className="panel divide-y divide-border/60">
            {top.map((entry) => (
              <li key={entry.user_id} className="flex items-center gap-4 px-5 py-3.5">
                <span className="numeric w-7 text-sm font-bold text-muted">#{entry.rank}</span>
                <span className="flex-1 truncate font-medium">{entry.username}</span>
                <span className="numeric font-bold text-cyan">{formatNumber(entry.score)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-center text-sm text-muted">
            Think you can crack it?{" "}
            <Link href="/signup" className="text-cyan underline-offset-4 hover:underline">
              Make an account
            </Link>{" "}
            and take a run.
          </p>
        </section>
      )}
    </div>
  );
}
