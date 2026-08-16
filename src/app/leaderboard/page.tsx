import type { Metadata } from "next";
import { Suspense } from "react";
import { LiveLeaderboard } from "@/components/LiveLeaderboard";
import { currentUser } from "@/lib/auth";
import { getLeaderboard, getUserRank, isPeriod } from "@/lib/leaderboard";
import { DEFAULT_MODE, isGameMode } from "@/lib/modes";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ mode?: string; period?: string }>;

export default async function LeaderboardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const mode = params.mode === "all" || isGameMode(params.mode) ? params.mode : DEFAULT_MODE;
  const period = isPeriod(params.period) ? params.period : "global";

  const user = await currentUser();
  const [entries, you] = await Promise.all([
    getLeaderboard(mode, period, 25),
    user ? getUserRank(user.id, mode, period) : null,
  ]);

  return (
    <div className="py-8">
      <Suspense fallback={null}>
        <LiveLeaderboard
          key={`${mode}:${period}`}
          mode={mode}
          period={period}
          initialEntries={entries}
          you={you}
          currentUserId={user?.id ?? null}
        />
      </Suspense>
    </div>
  );
}
