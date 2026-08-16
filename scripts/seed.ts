/**
 * Fills the database with demo players and runs spread over the past ten days,
 * so the daily, weekly and global boards all show something different.
 *
 *   npm run db:seed          # 24 players
 *   npm run db:seed -- 60    # 60 players
 *
 * Every seeded account uses the password `clickrush`.
 */
import bcrypt from "bcryptjs";
import { Client } from "pg";

const MODES = [
  { id: "classic", durationMs: 60_000 },
  { id: "sprint", durationMs: 15_000 },
  { id: "marathon", durationMs: 120_000 },
];

const NAMES = [
  "pixelpunk", "turbotoes", "clickzilla", "novaburst", "mintcondition", "gigawatt",
  "sonicboom", "quietstorm", "byteme", "hyperdrive", "lunartick", "voltage",
  "rapidfire", "zephyr", "cobalt", "midnight", "static", "vortex",
  "echobase", "nitro", "prism", "havoc", "solstice", "riptide",
  "blitz", "aurora", "kestrel", "onyx", "flare", "quasar",
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  const count = Math.min(Number(process.argv[2]) || 24, NAMES.length);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
    process.exit(1);
  }

  const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);
  const client = new Client({
    connectionString,
    ssl:
      process.env.DATABASE_SSL === "false" || (isLocal && process.env.DATABASE_SSL !== "true")
        ? undefined
        : { rejectUnauthorized: false },
  });

  await client.connect();
  const passwordHash = await bcrypt.hash("clickrush", 10);
  let runs = 0;

  try {
    await client.query("BEGIN");

    for (const name of NAMES.slice(0, count)) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (lower(username)) DO UPDATE SET username = EXCLUDED.username
         RETURNING id`,
        [name, `${name}@clickrush.demo`, passwordHash],
      );
      const userId = rows[0].id;

      // Each player has a skill level, so the board has a believable spread
      // instead of uniform noise.
      const skill = 3.5 + Math.random() * 6;

      for (let i = 0; i < randomInt(2, 7); i++) {
        const mode = MODES[randomInt(0, MODES.length - 1)];
        const seconds = mode.durationMs / 1000;
        const cps = Math.max(1, skill + (Math.random() - 0.5) * 2);
        const clicks = Math.round(cps * seconds);
        const score = Math.round(clicks * (60_000 / mode.durationMs));
        const daysAgo = Math.random() * 10;

        const { rows: session } = await client.query<{ id: string }>(
          `INSERT INTO game_sessions (user_id, mode, duration_ms, started_at, submitted_at)
           VALUES ($1, $2, $3, now() - ($4 || ' days')::interval, now() - ($4 || ' days')::interval)
           RETURNING id`,
          [userId, mode.id, mode.durationMs, daysAgo.toFixed(4)],
        );

        await client.query(
          `INSERT INTO scores (user_id, session_id, mode, clicks, duration_ms, score, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, now() - ($7 || ' days')::interval)`,
          [userId, session[0].id, mode.id, clicks, mode.durationMs, score, daysAgo.toFixed(4)],
        );
        runs++;
      }
    }

    await client.query("COMMIT");
    console.log(`✓ Seeded ${count} players and ${runs} runs. Password for all: clickrush`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("✗ Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
