/**
 * Game modes.
 *
 * Every mode has its own leaderboard, but scores are also normalised across
 * modes by a multiplier so a Sprint run and a Marathon run are comparable:
 *
 *     score = round(clicks × multiplier)
 *
 * The multiplier is `60_000 / durationMs`, i.e. every mode is expressed as
 * "clicks per 60 seconds". Classic is the identity case.
 */

export const GAME_MODES = {
  classic: {
    id: "classic",
    name: "Classic",
    tagline: "The original. 60 seconds, no mercy.",
    durationMs: 60_000,
    accent: "#22d3ee",
  },
  sprint: {
    id: "sprint",
    name: "Sprint",
    tagline: "15 seconds. Pure burst speed.",
    durationMs: 15_000,
    accent: "#f472b6",
  },
  marathon: {
    id: "marathon",
    name: "Marathon",
    tagline: "120 seconds. Stamina decides it.",
    durationMs: 120_000,
    accent: "#a78bfa",
  },
} as const;

export type GameModeId = keyof typeof GAME_MODES;
export type GameMode = (typeof GAME_MODES)[GameModeId];

export const MODE_IDS = Object.keys(GAME_MODES) as GameModeId[];
export const DEFAULT_MODE: GameModeId = "classic";

export function isGameMode(value: unknown): value is GameModeId {
  return typeof value === "string" && value in GAME_MODES;
}

export function getMode(id: GameModeId): GameMode {
  return GAME_MODES[id];
}

/** Normalises a raw click count into a comparable score. */
export function calculateScore(clicks: number, durationMs: number): number {
  return Math.round(clicks * (60_000 / durationMs));
}

/**
 * Upper bound on believable clicking. Anything above this is an autoclicker or
 * a forged request, and the finish endpoint rejects it.
 */
export const MAX_CLICKS_PER_SECOND = 25;
