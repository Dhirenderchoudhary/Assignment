/** Browser-side helpers for talking to the ClickRush API. */

export type ApiFailure = { error: string; details?: Record<string, string[]> };

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

/** `fetch` that throws a `RequestError` on non-2xx and returns parsed JSON otherwise. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const failure = payload as ApiFailure | null;
    throw new RequestError(
      failure?.error ?? "Something went wrong.",
      response.status,
      failure?.details,
    );
  }
  return payload as T;
}

export function post<T>(path: string, body?: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

/** 1234 → "1,234" */
export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

/** A short, human relative time: "just now", "4m ago", "3d ago". */
export function timeAgo(iso: string | Date): string {
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const seconds = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));

  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Run lengths, always in seconds. Rolling 120s up to "2m" would be tidier in
 * the abstract, but this game measures itself in seconds everywhere else
 * ("the 60-second challenge", "clicks per second"), and mixing the two units
 * makes two labels for the same mode look like two different modes.
 */
export function formatDuration(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}
