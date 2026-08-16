import { getLeaderboard, getLeaderboardVersion, isPeriod } from "@/lib/leaderboard";
import { DEFAULT_MODE, isGameMode } from "@/lib/modes";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POLL_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * GET /api/leaderboard/stream: Server-Sent Events feed of the live board.
 *
 * The connection polls a cheap fingerprint (`MAX(id):COUNT(*)` over scores)
 * and only runs the full leaderboard query, and only pushes a frame, when
 * that fingerprint changes. Idle clients therefore cost one trivial query
 * every two seconds rather than a ranking query per client per tick.
 *
 * SSE rather than WebSockets: the data flows one way, and it reconnects on
 * its own through `EventSource`.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const modeParam = searchParams.get("mode");
  const periodParam = searchParams.get("period");

  const mode = modeParam === "all" || isGameMode(modeParam) ? modeParam : DEFAULT_MODE;
  const period = isPeriod(periodParam) ? periodParam : "global";

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastVersion = "";
      let lastSentAt = 0;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        lastSentAt = Date.now();
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime, nothing to do.
        }
      };

      const tick = async () => {
        if (closed) return;
        try {
          const version = await getLeaderboardVersion();
          if (version !== lastVersion) {
            lastVersion = version;
            send("leaderboard", { mode, period, entries: await getLeaderboard(mode, period, 25) });
          } else if (Date.now() - lastSentAt >= HEARTBEAT_INTERVAL_MS) {
            // Keeps proxies from dropping an otherwise silent connection.
            send("ping", { t: Date.now() });
          }
        } catch (error) {
          console.error("[leaderboard/stream]", error);
          close();
        }
      };

      const timer = setInterval(tick, POLL_INTERVAL_MS);
      request.signal.addEventListener("abort", close);
      await tick(); // push the initial board immediately
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
