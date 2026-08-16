/** Matches the profile layout so the page settles instead of reflowing. */
export default function LoadingProfile() {
  return (
    <div className="flex flex-col gap-8 py-8" aria-busy="true" aria-label="Loading profile">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-9 w-52" />
        <div className="skeleton h-4 w-40" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="panel flex flex-col gap-2 px-4 py-4">
            <div className="skeleton h-7 w-20" />
            <div className="skeleton h-3 w-16" />
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="panel flex flex-col gap-3 p-5">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-8 w-28" />
            <div className="skeleton h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
