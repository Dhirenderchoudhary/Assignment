"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Catches anything a page throws. In practice that's almost always the
 * database being unreachable, so the copy points there rather than showing a
 * stack trace to a player.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="panel mx-auto mt-16 max-w-md px-6 py-12 text-center">
      <p className="text-5xl" aria-hidden>
        ⚡
      </p>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">That didn&apos;t load</h1>
      <p className="mt-2 text-sm text-muted">
        Something broke on our side. If this keeps happening the database is probably down.
      </p>

      {error.digest && (
        <p className="numeric mt-4 text-xs text-muted/70">Reference: {error.digest}</p>
      )}

      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-gradient-to-r from-cyan to-violet px-5 py-2.5 font-bold text-void transition-transform hover:scale-105"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-xl border border-border px-5 py-2.5 font-semibold text-muted transition-colors hover:border-muted hover:text-ink"
        >
          Back to the game
        </Link>
      </div>
    </div>
  );
}
