"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/client";

/**
 * A relative timestamp that survives hydration and stays fresh.
 *
 * Two problems this solves. First, the server renders "4m ago" from its clock
 * and the browser re-renders from a slightly different one, so the text can
 * disagree across a minute boundary and React reports a hydration mismatch;
 * `suppressHydrationWarning` says the difference is expected here. Second, the
 * leaderboard is a long-lived page, so "just now" would otherwise still claim
 * "just now" ten minutes later.
 */
export function TimeAgo({ at, className }: { at: string; className?: string }) {
  const [label, setLabel] = useState(() => timeAgo(at));

  useEffect(() => {
    const id = setInterval(() => setLabel(timeAgo(at)), 30_000);
    return () => clearInterval(id);
  }, [at]);

  return (
    <time dateTime={at} className={className} suppressHydrationWarning>
      {label}
    </time>
  );
}
