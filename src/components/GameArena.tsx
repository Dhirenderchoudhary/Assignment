"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GAME_MODES, type GameModeId, MODE_IDS } from "@/lib/modes";
import { formatDuration, formatNumber, post } from "@/lib/client";

type Phase = "idle" | "countdown" | "running" | "submitting" | "done" | "error";

type StartResponse = { sessionId: string; mode: GameModeId; durationMs: number };

type FinishResponse = {
  result: {
    clicks: number;
    score: number;
    durationMs: number;
    cps: number;
    isPersonalBest: boolean;
    previousBest: number;
  };
  ranks: {
    global: { rank: number; total_players: number } | null;
    daily: { rank: number; total_players: number } | null;
  };
};

/** A short-lived "+1" that floats up from wherever the player tapped. */
type Spark = { id: number; x: number; y: number };

type Props = {
  initialMode?: GameModeId;
  /** The player's best score in each mode, shown as the number to beat. */
  bests?: Partial<Record<GameModeId, number>>;
};

export function GameArena({ initialMode = "classic", bests = {} }: Props) {
  const router = useRouter();

  const [mode, setMode] = useState<GameModeId>(initialMode);
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(3);
  const [armed, setArmed] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [remainingMs, setRemainingMs] = useState<number>(GAME_MODES[initialMode].durationMs);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [result, setResult] = useState<FinishResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<string | null>(null);
  const clicksRef = useRef(0);
  const endsAtRef = useRef(0);
  const sparkId = useRef(0);
  const config = GAME_MODES[mode];
  const target = bests[mode] ?? 0;

  // --- lifecycle -------------------------------------------------------

  const submit = useCallback(async () => {
    const sessionId = sessionRef.current;
    sessionRef.current = null;

    if (!sessionId) {
      setError("Lost track of this run before it could be saved. Give it another go.");
      setPhase("error");
      return;
    }

    setPhase("submitting");
    try {
      setResult(await post<FinishResponse>("/api/game/finish", { sessionId, clicks: clicksRef.current }));
      setPhase("done");
      router.refresh(); // pull fresh leaderboard data into server components
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your run.");
      setPhase("error");
    }
  }, [router]);

  const begin = useCallback(async () => {
    setError(null);
    setResult(null);
    setClicks(0);
    clicksRef.current = 0;
    setArmed(false);
    setCountdown(3);
    setPhase("countdown");

    try {
      const session = await post<StartResponse>("/api/game/start", { mode });
      sessionRef.current = session.sessionId;
      setRemainingMs(session.durationMs);
      setArmed(true); // releases the countdown effect into the run
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the game.");
      setPhase("error");
    }
  }, [mode]);

  // 3 · 2 · 1 · GO!
  useEffect(() => {
    if (phase !== "countdown") return;

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown((n) => n - 1), 700);
      return () => clearTimeout(timer);
    }

    // "GO!" is showing. Hold it for a beat so it registers, then start the
    // clock, but only once the server has actually issued a session: on a slow
    // connection the countdown finishes first, and clicking through a run with
    // no ticket means it can never be saved. This effect re-runs when `armed`
    // flips, so a late session simply starts the run late.
    if (!armed) return;

    const timer = setTimeout(() => {
      endsAtRef.current = performance.now() + config.durationMs;
      setPhase("running");
    }, 450);
    return () => clearTimeout(timer);
  }, [phase, countdown, armed, config.durationMs]);

  // The running clock. rAF keeps the bar smooth without a 60 Hz React re-render
  // storm, state only updates when the displayed millisecond bucket changes.
  useEffect(() => {
    if (phase !== "running") return;
    let frame = 0;

    const tick = () => {
      const left = Math.max(0, endsAtRef.current - performance.now());
      setRemainingMs(left);
      if (left <= 0) {
        void submit();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, submit]);

  // Spacebar and Enter are legitimate ways to click, but only while running,
  // and never while the player is typing somewhere else.
  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      registerClick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // --- clicking --------------------------------------------------------

  function registerClick(event?: React.PointerEvent<HTMLButtonElement>) {
    if (phase !== "running") return;

    clicksRef.current += 1;
    setClicks(clicksRef.current);

    const id = sparkId.current++;
    const target = event?.currentTarget.getBoundingClientRect();
    const x = event && target ? ((event.clientX - target.left) / target.width) * 100 : 50;
    const y = event && target ? ((event.clientY - target.top) / target.height) * 100 : 50;

    setSparks((current) => [...current.slice(-14), { id, x, y }]);
    setTimeout(() => setSparks((current) => current.filter((s) => s.id !== id)), 900);

    if (navigator.vibrate) navigator.vibrate(8);
  }

  // --- derived ---------------------------------------------------------

  const secondsLeft = Math.ceil(remainingMs / 1000);
  const progress = Math.max(0, Math.min(1, remainingMs / config.durationMs));
  const elapsedSeconds = (config.durationMs - remainingMs) / 1000;
  const liveCps = elapsedSeconds > 0.4 ? clicks / elapsedSeconds : 0;

  // The last quarter of the run turns red, capped at ten seconds. A flat ten
  // seconds would paint two thirds of a Sprint urgent, which stops meaning
  // anything.
  const urgentBelowMs = Math.min(10_000, config.durationMs * 0.25);
  const isUrgent = phase === "running" && remainingMs <= urgentBelowMs;

  // Live pace projected over the full run, so "on track to beat your best" is
  // answerable while there is still time to do something about it.
  const projected = Math.round(liveCps * 60);
  const beatingBest = phase === "running" && target > 0 && elapsedSeconds > 3 && projected > target;

  // ---------------------------------------------------------------- render

  if (phase === "done" && result) {
    return (
      <ResultCard
        result={result}
        mode={mode}
        onPlayAgain={begin}
        onChangeMode={() => {
          setResult(null);
          setRemainingMs(config.durationMs);
          setPhase("idle");
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ModePicker
        mode={mode}
        bests={bests}
        disabled={phase !== "idle" && phase !== "error"}
        onChange={(next) => {
          setMode(next);
          setRemainingMs(GAME_MODES[next].durationMs);
        }}
      />

      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {/* Scoreboard */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Clicks" value={formatNumber(clicks)} accent="text-cyan" />
        <Stat
          label="Time left"
          value={`${secondsLeft}s`}
          accent={isUrgent ? "text-danger" : "text-ink"}
        />
        <Stat label="Clicks / sec" value={liveCps.toFixed(1)} accent="text-violet" />
      </div>

      {/* Time bar */}
      <div
        role="progressbar"
        aria-label="Time remaining"
        aria-valuemin={0}
        aria-valuemax={config.durationMs / 1000}
        aria-valuenow={secondsLeft}
        className="h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={`h-full rounded-full transition-colors ${
            isUrgent ? "bg-danger" : "bg-gradient-to-r from-cyan to-violet"
          }`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* The number to beat, and whether the current pace beats it. */}
      {target > 0 && (
        <p
          className={`-mt-3 text-center text-xs transition-colors ${
            beatingBest ? "font-semibold text-lime" : "text-muted"
          }`}
        >
          {beatingBest ? (
            <>On pace for {formatNumber(projected)} — ahead of your best</>
          ) : (
            <>
              Your {config.name} best: <span className="numeric text-ink">{formatNumber(target)}</span>
            </>
          )}
        </p>
      )}

      {/* The arena. The tap target wants to be big, but an unbounded 16:9 box
          is over 500px tall on a desktop and becomes a field of empty void, so
          it's capped to keep the whole game above the fold. */}
      <button
        type="button"
        onPointerDown={phase === "running" ? registerClick : undefined}
        onClick={phase === "idle" || phase === "error" ? begin : undefined}
        disabled={phase === "countdown" || phase === "submitting"}
        aria-label={phase === "running" ? "Click to score" : "Start the game"}
        style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
        className={`relative grid aspect-square max-h-[60vh] w-full select-none place-items-center overflow-hidden rounded-3xl border-2 transition-[border-color,box-shadow] sm:aspect-[16/9] sm:max-h-[400px] ${
          phase === "running"
            ? "cursor-pointer border-cyan/70 bg-surface active:animate-pop"
            : "border-border bg-surface/60 hover:border-muted/50"
        } ${isUrgent ? "border-danger/70 shadow-[0_0_60px_-12px] shadow-danger/50" : ""}`}
      >
        {/* A faint pool of light so the surface reads as a stage, not a hole. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-500"
          style={{
            background:
              "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(34, 211, 238, 0.07), transparent 70%)",
            opacity: phase === "running" ? 1 : 0.45,
          }}
        />
        {/* Floating +1s */}
        {sparks.map((spark) => (
          <span
            key={spark.id}
            aria-hidden
            className="pointer-events-none absolute animate-rise text-2xl font-black text-cyan"
            style={{ left: `${spark.x}%`, top: `${spark.y}%` }}
          >
            +1
          </span>
        ))}

        {phase === "running" && (
          <span
            aria-hidden
            className="pointer-events-none absolute size-48 animate-pulse-ring rounded-full border-2 border-cyan/40"
          />
        )}

        <span className="relative z-10 px-6 text-center">
          {phase === "idle" || phase === "error" ? (
            <>
              <span className="block text-4xl font-black tracking-tight text-gradient sm:text-6xl">
                {error ? "TRY AGAIN" : "START"}
              </span>
              <span className="mt-2 block text-sm text-muted">
                {config.name} · {formatDuration(config.durationMs)}
              </span>
              <span className="mt-1 block text-xs text-muted/70">
                Click anywhere in here, or press space
              </span>
            </>
          ) : phase === "countdown" ? (
            <span
              key={countdown}
              className="block animate-drop-in text-7xl font-black text-gradient sm:text-8xl"
            >
              {countdown > 0 ? countdown : armed ? "GO!" : "…"}
            </span>
          ) : phase === "submitting" ? (
            <span className="block text-2xl font-bold text-muted">Saving your run…</span>
          ) : (
            <>
              <span className="numeric block text-7xl font-black tabular-nums text-ink sm:text-9xl">
                {clicks}
              </span>
              <span className="mt-1 block text-xs uppercase tracking-[0.3em] text-muted">
                clicks
              </span>
            </>
          )}
        </span>
      </button>

      {/* Phase changes are announced; the click count deliberately is not,
          since a live region firing on every tap would be unusable. */}
      <p aria-live="polite" className="sr-only">
        {phase === "running"
          ? `Go. ${config.name}, ${formatDuration(config.durationMs)}.`
          : phase === "submitting"
            ? "Time. Saving your run."
            : ""}
      </p>

      <p className="text-center text-xs text-muted">
        Runs are validated on the server. The clock that counts is ours.{" "}
        <Link href="/leaderboard" className="text-cyan underline-offset-4 hover:underline">
          See the leaderboard
        </Link>
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="panel px-3 py-3 text-center sm:px-4">
      <div className={`numeric text-2xl font-bold sm:text-3xl ${accent}`}>{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-widest text-muted">{label}</div>
    </div>
  );
}

function ModePicker({
  mode,
  bests,
  disabled,
  onChange,
}: {
  mode: GameModeId;
  bests: Partial<Record<GameModeId, number>>;
  disabled: boolean;
  onChange: (mode: GameModeId) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Game mode" className="grid grid-cols-3 gap-2">
      {MODE_IDS.map((id) => {
        const config = GAME_MODES[id];
        const selected = id === mode;
        const best = bests[id];
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(id)}
            title={config.tagline}
            className={`rounded-xl border px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
              selected
                ? "border-transparent bg-surface-2 ring-2"
                : "border-border bg-surface/50 hover:border-muted/50 hover:bg-surface"
            }`}
            style={selected ? { "--tw-ring-color": config.accent } as React.CSSProperties : undefined}
          >
            <div
              className="truncate text-sm font-semibold"
              style={{ color: selected ? config.accent : undefined }}
            >
              {config.name}
            </div>
            <div className="text-[11px] text-muted">
              {formatDuration(config.durationMs)}
              {best ? <span className="numeric"> · PB {formatNumber(best)}</span> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ResultCard({
  result,
  mode,
  onPlayAgain,
  onChangeMode,
}: {
  result: FinishResponse;
  mode: GameModeId;
  onPlayAgain: () => void;
  onChangeMode: () => void;
}) {
  const { result: run, ranks } = result;
  const shortBy = run.previousBest - run.score;

  return (
    <div className="animate-slide-up panel flex flex-col items-center gap-6 px-4 py-10 text-center sm:px-6">
      {run.isPersonalBest ? (
        <span className="animate-shimmer rounded-full bg-gradient-to-r from-amber to-pink bg-[length:200%_100%] px-4 py-1 text-xs font-black uppercase tracking-widest text-void">
          ★ New personal best
        </span>
      ) : (
        shortBy > 0 && (
          <span className="rounded-full border border-border px-4 py-1 text-xs font-semibold uppercase tracking-widest text-muted">
            {formatNumber(shortBy)} short of your best
          </span>
        )
      )}

      <div>
        <p className="text-xs uppercase tracking-widest text-muted">
          {GAME_MODES[mode].name} · final score
        </p>
        <p className="numeric mt-1 text-6xl font-black text-gradient sm:text-8xl">
          {formatNumber(run.score)}
        </p>
      </div>

      <dl className="grid w-full max-w-md grid-cols-3 gap-2 sm:gap-3">
        <Detail label="Clicks" value={formatNumber(run.clicks)} />
        <Detail label="Clicks / sec" value={run.cps.toFixed(2)} />
        <Detail
          label="Previous best"
          value={run.previousBest ? formatNumber(run.previousBest) : "—"}
        />
      </dl>

      <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-muted">
        {ranks.global && (
          <span>
            Global <strong className="numeric text-ink">#{ranks.global.rank}</strong> of{" "}
            {formatNumber(ranks.global.total_players)}
          </span>
        )}
        {ranks.daily && (
          <span>
            Today <strong className="numeric text-ink">#{ranks.daily.rank}</strong> of{" "}
            {formatNumber(ranks.daily.total_players)}
          </span>
        )}
      </div>

      <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onPlayAgain}
          className="rounded-xl bg-gradient-to-r from-cyan to-violet px-6 py-3 font-bold text-void transition-transform hover:scale-105"
        >
          Play {GAME_MODES[mode].name} again
        </button>
        <Link
          href="/leaderboard"
          className="rounded-xl border border-border px-6 py-3 text-center font-semibold text-muted transition-colors hover:border-muted hover:text-ink"
        >
          Leaderboard
        </Link>
      </div>

      <button
        type="button"
        onClick={onChangeMode}
        className="text-sm text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
      >
        Pick a different mode
      </button>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2/60 px-2 py-3">
      <dd className="numeric text-lg font-bold text-ink">{value}</dd>
      <dt className="text-[10px] uppercase tracking-widest text-muted">{label}</dt>
    </div>
  );
}
