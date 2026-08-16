import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel mx-auto mt-16 max-w-md px-6 py-12 text-center">
      <p className="numeric text-6xl font-black text-gradient">404</p>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Nothing here</h1>
      <p className="mt-2 text-sm text-muted">
        This page doesn&apos;t exist. The clock is still running elsewhere.
      </p>

      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          href="/"
          className="rounded-xl bg-gradient-to-r from-cyan to-violet px-5 py-2.5 font-bold text-void transition-transform hover:scale-105"
        >
          Play a run
        </Link>
        <Link
          href="/leaderboard"
          className="rounded-xl border border-border px-5 py-2.5 font-semibold text-muted transition-colors hover:border-muted hover:text-ink"
        >
          Leaderboard
        </Link>
      </div>
    </div>
  );
}
