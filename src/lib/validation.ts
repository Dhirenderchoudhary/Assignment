import { z } from "zod";
import { type GameModeId, MODE_IDS } from "./modes";
import { type Period, PERIODS } from "./leaderboard";

const modeSchema = z.enum(MODE_IDS as [GameModeId, ...GameModeId[]]);
const periodSchema = z.enum(PERIODS as unknown as [Period, ...Period[]]);

export const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(20, "Username must be at most 20 characters.")
    .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers and underscores."),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  // bcrypt silently truncates past 72 bytes, so reject rather than mislead.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password must be at most 72 characters."),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password."),
});

export const startGameSchema = z.object({
  mode: modeSchema,
});

export const finishGameSchema = z.object({
  sessionId: z.uuid("Unknown game session."),
  clicks: z.number().int().min(0).max(100_000),
});

export const leaderboardQuerySchema = z.object({
  mode: z.union([modeSchema, z.literal("all")]).default("classic"),
  period: periodSchema.default("global"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
