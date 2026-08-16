import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { ApiError } from "./api";
import { queryOne } from "./db";
import { SESSION_COOKIE } from "./session-cookie";

export { SESSION_COOKIE };

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const BCRYPT_ROUNDS = 10;

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  created_at: string;
};

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to a random string of at least 32 characters. Generate one with: openssl rand -base64 32",
    );
  }
  return new TextEncoder().encode(value);
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Issues a signed JWT and writes it to an httpOnly cookie. */
export async function createSession(userId: number): Promise<void> {
  const token = await new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Returns the signed-in user, or `null` if the request is anonymous. */
export async function currentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    userId = payload.sub;
  } catch {
    return null; // expired, tampered with, or signed by a rotated secret
  }

  return queryOne<AuthUser>(
    `SELECT id, username, email, created_at FROM users WHERE id = $1`,
    [Number(userId)],
  );
}

/** Like `currentUser`, but throws an `ApiError` the route handler turns into a 401. */
export async function requireUser(): Promise<AuthUser> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "You must be signed in to do that.");
  return user;
}
