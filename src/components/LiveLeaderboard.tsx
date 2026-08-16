"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { LeaderboardRow, Period, UserRank } from "@/lib/leaderboard";
import { GAME_MODES, type GameModeId, MODE_IDS } from "@/lib/modes";
import { formatNumber } from "@/lib/client";
import { TimeAgo } from "./TimeAgo";

type Props = {
  mode: GameModeId | "all";
  period: Period;
  initialEntries: LeaderboardRow[];
  you: UserRank;
  currentUserId: number | null;
};

const PERIOD_LABELS: Record<Period, string> = {
  global: "All time",
  daily: "Today",
  weekly: "This week",
};

const MEDALS = ["#fbbf24", "#cbd5e1", "#d08c60"];

export function LiveLeaderboard({ mode, period, initialEntries, you, currentUserId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [entries, setEntries] = useState(initialEntries);
  // "connecting" is distinct from "offline": a fresh page load should not
  // accuse the stream of having dropped before it has ever opened.
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const previous = useRef(initialEntries);

  // The page keys this component on mode+period, so changing a filter
  // remounts it with freshly server-rendered rows. The stream only ever
  // layers updates on top of that first paint.
  useEffect(() => {
    const source = new EventSource(`/api/leaderboard/stream?mode=${mode}&period=${period}`);

    source.addEventListener("open", () => setStatus("live"));

    source.addEventListener("leaderboard", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as {
        entries: LeaderboardRow[];
      };
      setStatus("live");

      // Highlight rows whose score moved, so a change is visible rather than
      // just silently replacing numbers.
      const before = new Map(previous.current.map((row) => [row.user_id, row.score]));
      const moved = new Set(
        payload.entries.filter((row) => before.get(row.user_id) !== row.score).map((r) => r.user_id),
      );

      previous.current = payload.entries;
      setEntries(payload.entries);

      if (moved.size > 0) {
        setFlash(moved);
        setTimeout(() => setFlash(new Set()), 1600);
      }
    });

    // EventSource retries on its own; this only reflects that it is trying.
    source.addEventListener("error", () => setStatus("offline"));

    return () => source.close();
  }, [mode, period]);

  function setFilter(key: "mode" | "period", value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set(key, value);
    router.replace(`/leaderboard?${next}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-sm text-muted">One entry per player: their best run in the window.</p>
        </div>
        <span
          title="Scores appear here as they are set, without reloading."
          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
            status === "live"
              ? "border-lime/40 text-lime"
              : status === "offline"
                ? "border-danger/40 text-danger"
                : "border-border text-muted"
          }`}
        >
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${
              status === "live"
                ? "animate-pulse bg-lime"
                : status === "offline"
                  ? "bg-danger"
                  : "animate-pulse bg-muted"
            }`}
          />
          {status === "live" ? "Live" : status === "offline" ? "Reconnecting" : "Connecting"}
        </span>
      </div>

      {/* Two filter groups do not fit side by side on a phone, and wrapping
          them leaves a ragged second row. Each scrolls on its own instead. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Tabs
          label="Period"
          value={period}
          options={(Object.keys(PERIOD_LABELS) as Period[]).map((p) => ({
            value: p,
            label: PERIOD_LABELS[p],
          }))}
          onChange={(value) => setFilter("period", value)}
        />
        <Tabs
          label="Mode"
          value={mode}
          options={[
            { value: "all", label: "All" },
            ...MODE_IDS.map((id) => ({ value: id, label: GAME_MODES[id].name })),
          ]}
          onChange={(value) => setFilter("mode", value)}
        />
      </div>

      {entries.length === 0 ? (
        <div className="panel px-6 py-16 text-center">
          <p className="font-semibold">Nothing on this board yet.</p>
          <p className="mt-1 text-sm text-muted">
            {period === "global"
              ? "No one has finished a run in this mode."
              : "No runs in this window. Try All time."}
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-xl bg-gradient-to-r from-cyan to-violet px-5 py-2.5 text-sm font-bold text-void transition-transform hover:scale-105"
          >
            Be the first
          </Link>
        </div>
      ) : (
        <ol className="panel divide-y divide-border/60 overflow-hidden">
          {entries.map((entry) => {
            const isYou = entry.user_id === currentUserId;
            return (
              <li
                key={entry.user_id}
                className={`flex items-center gap-3 px-4 py-3.5 transition-colors duration-500 sm:gap-4 sm:px-5 ${
                  flash.has(entry.user_id)
                    ? "bg-lime/10"
                    : isYou
                      ? "bg-cyan/8"
                      : "hover:bg-surface-2/40"
                }`}
              >
                <span
                  className="numeric w-9 shrink-0 text-center text-sm font-black"
                  style={{ color: MEDALS[entry.rank - 1] ?? "var(--color-muted)" }}
                >
                  {entry.rank <= 3 ? "★" : ""}
                  {entry.rank}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {entry.username}
                    {isYou && (
                      <span className="ml-2 rounded-full bg-cyan/15 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wider text-cyan">
                        you
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {/* On the combined board the score is normalised, so name
                        the mode the run came from or the numbers look wrong. */}
                    {mode === "all" && (
                      <span style={{ color: GAME_MODES[entry.mode]?.accent }}>
                        {GAME_MODES[entry.mode]?.name ?? entry.mode} ·{" "}
                      </span>
                    )}
                    {formatNumber(entry.clicks)} clicks · <TimeAgo at={entry.achieved_at} />
                  </div>
                </div>

                <span className="numeric shrink-0 text-lg font-black text-ink sm:text-xl">
                  {formatNumber(entry.score)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {/* Below the visible cut, a player still needs to know where they stand. */}
      {you && !entries.some((entry) => entry.user_id === currentUserId) && (
        <p className="panel border-cyan/30 px-5 py-3.5 text-sm text-muted">
          You sit at <strong className="numeric text-ink">#{you.rank}</strong> of{" "}
          {formatNumber(you.total_players)} with{" "}
          <strong className="numeric text-ink">{formatNumber(you.score)}</strong>.
        </p>
      )}
    </div>
  );
}

function Tabs({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface/60 p-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={selected}
            type="button"
            onClick={() => onChange(option.value)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              selected ? "bg-surface-2 font-semibold text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
