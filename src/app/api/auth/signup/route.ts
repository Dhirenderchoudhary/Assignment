import { ApiError, handler, json, readJson } from "@/lib/api";
import { createSession, hashPassword } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { signupSchema } from "@/lib/validation";

/** POST /api/auth/signup: create an account and sign in. */
export const POST = handler(async (request: Request) => {
  const { username, email, password } = signupSchema.parse(await readJson(request));

  const existing = await queryOne<{ username: string; email: string }>(
    `SELECT username, email FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($2)`,
    [username, email],
  );
  if (existing) {
    const field = existing.username.toLowerCase() === username.toLowerCase() ? "username" : "email";
    throw new ApiError(409, `That ${field} is already taken.`);
  }

  const user = await queryOne<{ id: number; username: string; email: string }>(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, username, email`,
    [username, email, await hashPassword(password)],
  );
  if (!user) throw new ApiError(500, "Could not create your account.");

  await createSession(user.id);
  return json({ user }, 201);
});
