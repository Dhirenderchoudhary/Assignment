import { handler, json } from "@/lib/api";
import { destroySession } from "@/lib/auth";

/** POST /api/auth/logout: clear the session cookie. */
export const POST = handler(async () => {
  await destroySession();
  return json({ ok: true });
});
