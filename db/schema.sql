-- ClickRush database schema (PostgreSQL)
--
-- Three tables:
--   users          accounts
--   game_sessions  a server-issued ticket for one playthrough (anti-cheat)
--   scores         one finalised result per completed session
--
-- Idempotent: safe to run repeatedly (`npm run db:migrate`).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- users

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL    PRIMARY KEY,
  username      TEXT         NOT NULL,
  email         TEXT         NOT NULL,
  password_hash TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness without requiring the citext extension.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key    ON users (lower(email));

-- -------------------------------------------------------- game_sessions

-- A session is minted by POST /api/game/start *before* the player clicks.
-- POST /api/game/finish validates the submitted result against the
-- server-recorded start time, so a client cannot fabricate or replay a run.
CREATE TABLE IF NOT EXISTS game_sessions (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mode          TEXT         NOT NULL,
  duration_ms   INTEGER      NOT NULL,
  started_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  submitted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS game_sessions_user_idx ON game_sessions (user_id, started_at DESC);

-- --------------------------------------------------------------- scores

CREATE TABLE IF NOT EXISTS scores (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  session_id  UUID         NOT NULL UNIQUE REFERENCES game_sessions (id) ON DELETE CASCADE,
  mode        TEXT         NOT NULL,
  clicks      INTEGER      NOT NULL CHECK (clicks >= 0),
  duration_ms INTEGER      NOT NULL CHECK (duration_ms > 0),
  score       INTEGER      NOT NULL CHECK (score >= 0),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Leaderboard reads are always "top scores for a mode, optionally within a
-- time window". This composite index serves the global board directly and
-- lets the daily/weekly windows range-scan on created_at.
CREATE INDEX IF NOT EXISTS scores_mode_score_idx  ON scores (mode, score DESC, created_at);
CREATE INDEX IF NOT EXISTS scores_mode_recent_idx ON scores (mode, created_at DESC, score DESC);

-- Profile history + personal-best lookups.
CREATE INDEX IF NOT EXISTS scores_user_recent_idx ON scores (user_id, created_at DESC);
