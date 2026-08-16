/**
 * Shown while the board is being queried. It mirrors the real layout so the
 * page doesn't jump when the rows arrive.
 */
export default function LoadingLeaderboard() {
  return (
    <div className="flex flex-col gap-5 py-8" aria-busy="true" aria-label="Loading leaderboard">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-7 w-40" />
        <div className="skeleton h-4 w-64" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="skeleton h-10 w-56" />
        <div className="skeleton h-10 w-64" />
      </div>

      <ol className="panel divide-y divide-border/60">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="skeleton size-5 shrink-0" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="skeleton h-4" style={{ width: `${45 - i * 3}%` }} />
              <div className="skeleton h-3 w-32" />
            </div>
            <div className="skeleton h-5 w-14 shrink-0" />
          </li>
        ))}
      </ol>
    </div>
  );
}
