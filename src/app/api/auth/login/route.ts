import { ApiError, handler, json, readJson } from "@/lib/api";
import { createSession, verifyPassword } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { loginSchema } from "@/lib/validation";

/** POST /api/auth/login: exchange credentials for a session cookie. */
export const POST = handler(async (request: Request) => {
  const { email, password } = loginSchema.parse(await readJson(request));

  const row = await queryOne<{
    id: number;
    username: string;
    email: string;
    password_hash: string;
  }>(`SELECT id, username, email, password_hash FROM users WHERE lower(email) = lower($1)`, [email]);

  // Same message either way, so the endpoint can't be used to enumerate accounts.
  const invalid = new ApiError(401, "Incorrect email or password.");
  if (!row) throw invalid;
  if (!(await verifyPassword(password, row.password_hash))) throw invalid;

  await createSession(row.id);
  return json({ user: { id: row.id, username: row.username, email: row.email } });
});
