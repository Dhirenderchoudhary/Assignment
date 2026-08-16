import { handler, json } from "@/lib/api";
import { currentUser } from "@/lib/auth";

/** GET /api/auth/me: the signed-in user, or `{ user: null }` when anonymous. */
export const GET = handler(async () => json({ user: await currentUser() }));
