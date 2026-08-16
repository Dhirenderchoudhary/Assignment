# ClickRush

A 60-second click challenge. Sign up, mash a button until the timer runs out, and see
where you land on the global, daily and weekly boards.

Built with Next.js (App Router) and PostgreSQL.

---

## Running it locally

You need Node 20+ and a PostgreSQL 14+ database. Docker is the quickest way to get one.

```bash
git clone <your-repo-url> clickrush
cd clickrush
npm install

cp .env.example .env.local          # then edit AUTH_SECRET (see below)
docker compose up -d                # starts Postgres on :5432
npm run db:migrate                  # creates the tables and indexes
npm run db:seed                     # optional: 24 demo players with history

npm run dev                         # http://localhost:3000
```

`AUTH_SECRET` signs the session cookies and must be at least 32 characters:

```bash
openssl rand -base64 32
```

If you already have Postgres elsewhere (Neon, Supabase, a local install), skip the Docker
step and point `DATABASE_URL` at it instead. TLS is enabled automatically for any host
that isn't `localhost`; override with `DATABASE_SSL=true|false`.

Seeded accounts all use the password `clickrush`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run db:migrate` | Applies `db/schema.sql` (idempotent, safe to re-run) |
| `npm run db:seed` | Inserts demo players and runs spread over the last 10 days |
| `npm run smoke` | End-to-end API test against a running server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

`npm run smoke` needs a server already running (`npm run dev` in another terminal). It
signs up a throwaway account, plays two real timed runs, and asserts every anti-cheat
rejection, all three leaderboard periods, the profile, and the auth redirects — 29 checks,
about 35 seconds. Point it elsewhere with `BASE_URL=https://… npm run smoke`.

---

## How the game works

A run is not something the browser can simply assert happened. The flow is:

1. `POST /api/game/start` writes a `game_sessions` row and returns its id. The row's
   `started_at` is the database clock — the browser never supplies it.
2. The player clicks. The countdown they see is client-side, because a server-driven
   timer would feel awful, but it has no authority.
3. `POST /api/game/finish` submits the session id and a click count, and the server
   decides whether to believe it.

A submission is rejected when:

| Check | Response |
| --- | --- |
| The session belongs to someone else, or doesn't exist | `404` |
| The session was already submitted | `409` |
| Less time has passed than the mode's duration (1.5s of slack for timer jitter) | `400` |
| More than 30s past the duration (tab was backgrounded, connection dropped) | `408` |
| The click rate exceeds 25 clicks/second | `422` |

The session row is locked with `SELECT … FOR UPDATE` and the update plus insert happen in
one transaction, so two submissions racing for the same session can't both get through.
`scores.session_id` is `UNIQUE`, which enforces the same rule at the schema level.

None of this makes cheating impossible — a scripted client that waits the full 60 seconds
and reports 24 clicks/second still gets in. It makes cheating cost more than playing.

### Score calculation

```
score = round(clicks × 60000 / duration_ms)
```

Every mode is expressed as "clicks per 60 seconds", so a 15-second Sprint and a
120-second Marathon produce comparable numbers and can share a combined leaderboard.
For Classic the multiplier is 1, so score equals clicks.

### Game modes

| Mode | Duration | Multiplier |
| --- | --- | --- |
| Classic | 60s | ×1 |
| Sprint | 15s | ×4 |
| Marathon | 120s | ×0.5 |

---

## Database schema

Three tables. `db/schema.sql` is the source of truth.

**`users`**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `BIGSERIAL` | primary key |
| `username` | `TEXT` | unique on `lower(username)` |
| `email` | `TEXT` | unique on `lower(email)` |
| `password_hash` | `TEXT` | bcrypt, 10 rounds |
| `created_at` | `TIMESTAMPTZ` | |

Uniqueness is enforced by a functional index on `lower(...)` rather than the `citext`
extension, so the schema works on any Postgres without extra setup.

**`game_sessions`** — one row per playthrough, created before the player clicks.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `UUID` | `gen_random_uuid()`; unguessable, so ids can't be enumerated |
| `user_id` | `BIGINT` | → `users`, cascade delete |
| `mode` | `TEXT` | |
| `duration_ms` | `INTEGER` | copied from the mode at start time |
| `started_at` | `TIMESTAMPTZ` | the authoritative clock |
| `submitted_at` | `TIMESTAMPTZ` | `NULL` until finished; makes replay detectable |

**`scores`** — one row per completed run.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `BIGSERIAL` | primary key |
| `user_id` | `BIGINT` | → `users` |
| `session_id` | `UUID` | → `game_sessions`, **unique** |
| `mode`, `clicks`, `duration_ms`, `score` | | `CHECK` constrained non-negative |
| `created_at` | `TIMESTAMPTZ` | |

`mode` and `duration_ms` are denormalised onto `scores` deliberately: leaderboard queries
then never need to join `game_sessions`, and a historical run keeps the duration it was
actually played at even if a mode's configuration changes later.

### Indexes

| Index | Serves |
| --- | --- |
| `scores (mode, score DESC, created_at)` | the global board, read straight off the index |
| `scores (mode, created_at DESC, score DESC)` | daily/weekly range scans |
| `scores (user_id, created_at DESC)` | profile history and personal bests |
| `game_sessions (user_id, started_at DESC)` | a player's session lookups |

### How a leaderboard is computed

A leaderboard ranks *players*, not runs — otherwise one person having a good afternoon
fills the entire top ten. Each query collapses every player to their single best run in
the window first:

```sql
SELECT DISTINCT ON (s.user_id) …
  FROM scores s
 WHERE s.mode = ANY($1) AND s.created_at >= now() - INTERVAL '7 days'
 ORDER BY s.user_id, s.score DESC, s.created_at ASC
```

then ranks those bests with `ROW_NUMBER()`. Ties are broken by who got there first, so a
score can never be displaced by someone merely matching it.

Daily and weekly are **rolling** windows (`now() - INTERVAL '1 day'`), not calendar
buckets. A calendar-day board is empty and demoralising at 00:05; a rolling one always
has something on it.

---

## API

All responses are JSON. Errors use `{ "error": string, "details"?: object }`.
Authentication is a signed JWT in an httpOnly, SameSite=Lax cookie.

### Health

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/api/health` | `200` when the app is wired up, `503` with a hint when it isn't |

Every other route answers a database failure with the same opaque `500`, which is right
for players but useless when a fresh deployment is down: an unset `DATABASE_URL`, an
unreachable host and a database with no tables in it all look identical. This separates
them, reporting only presence and shape — never the connection string, key material, or
driver error text, which can carry the host and user name.

```bash
curl -s https://<deployment>/api/health | jq
{
  "ok": false,
  "checks": {
    "database_url_set": true,
    "auth_secret_valid": true,
    "database_reachable": true,
    "schema_applied": false
  },
  "hint": "Connected, but the tables are missing. Run: DATABASE_URL='<prod-url>' npm run db:migrate"
}
```

### Auth

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `POST` | `/api/auth/signup` | `{ username, email, password }` | `201` `{ user }`, sets cookie |
| `POST` | `/api/auth/login` | `{ email, password }` | `200` `{ user }`, sets cookie |
| `POST` | `/api/auth/logout` | — | `200` `{ ok: true }` |
| `GET` | `/api/auth/me` | — | `200` `{ user }` or `{ user: null }` |

Login returns the same `401` message whether the email is unknown or the password is
wrong, so the endpoint can't be used to discover which accounts exist.

### Game

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `POST` | `/api/game/start` | `{ mode }` | `{ sessionId, mode, durationMs, startedAt }` |
| `POST` | `/api/game/finish` | `{ sessionId, clicks }` | `201` `{ result, ranks }` |

`result` includes the score, clicks/second, whether it beat the player's previous best,
and their new global and daily rank.

### Leaderboards

| Method | Path | Query | Returns |
| --- | --- | --- | --- |
| `GET` | `/api/leaderboard` | `mode` (`classic`\|`sprint`\|`marathon`\|`all`), `period` (`global`\|`daily`\|`weekly`), `limit` (1–100, default 25) | `{ mode, period, entries, you }` |
| `GET` | `/api/leaderboard/stream` | `mode`, `period` | `text/event-stream` |

`you` is the caller's own standing, included even when they rank below the returned
slice, so a player can always see where they are.

### Profile

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/api/profile` | `{ user, stats, bests, history, ranks }` |

`ranks` covers all nine period × mode boards plus the three combined ones.

---

## Real-time leaderboard

`/api/leaderboard/stream` is Server-Sent Events rather than WebSockets: the data only
flows one way, and browsers reconnect automatically through `EventSource`.

A naïve implementation would re-run the ranking query per client per tick. Instead the
connection polls a cheap fingerprint:

```sql
SELECT COALESCE(MAX(id), 0) || ':' || COUNT(*) FROM scores
```

and only runs the real query, and only emits a frame, when that value changes. An idle
board costs one trivial aggregate every two seconds no matter how many people are
watching it. A `ping` event every 20 seconds keeps proxies from dropping quiet
connections.

The leaderboard page still server-renders its first paint, so it's populated before any
JavaScript runs; the stream only layers updates on top. Rows whose score changed briefly
highlight, so an update is something you notice rather than a number that silently swaps.

---

## Project layout

```
db/schema.sql              tables, constraints, indexes
scripts/migrate.ts         applies the schema
scripts/seed.ts            demo data
scripts/smoke.sh           end-to-end API test
src/app/                   pages and route handlers
  api/auth/                signup, login, logout, me
  api/game/                start, finish
  api/leaderboard/         board + SSE stream
  api/profile/
src/components/            GameArena, LiveLeaderboard, AuthForm, Nav
src/lib/
  db.ts                    pooled connection + query helpers
  auth.ts                  bcrypt, JWT sessions, currentUser/requireUser
  api.ts                   error envelope, route handler wrapper
  leaderboard.ts           ranking queries
  stats.ts                 profile aggregates
  modes.ts                 mode config + score calculation
  validation.ts            Zod schemas
```

There's no ORM. The queries here are the interesting part of the project — ranking,
windowing, deduplicating by player — and expressing them in SQL is clearer than
expressing them through an abstraction. `src/lib/db.ts` is a thin typed wrapper over
`pg`, and every query is parameterised.

Two `pg` type parsers are registered there: `BIGINT` is parsed to a JS number (the driver
returns strings by default, which breaks `===` comparisons against ids), and `TIMESTAMPTZ`
to an ISO string (so a timestamp is the same shape in a server component, a client prop,
and a JSON response).

---

## Deploying

Any Node host works, and any Postgres. On Vercel:

1. Push to GitHub and import the repository.
2. Point `DATABASE_URL` at a Postgres instance. With Supabase, take **Project Settings →
   Database → Connection string → Transaction pooler** (port 6543), not the direct 5432
   host — serverless functions open a connection per instance and exhaust the direct
   limit. Neon via the Vercel Marketplace also works and sets the variable for you.
3. Set `AUTH_SECRET` to the output of `openssl rand -base64 32`.
4. Run the migration once against the production database:
   `DATABASE_URL='<prod-url>' npm run db:migrate`

The SSE route is a normal Node function (`maxDuration = 300`), so it needs no special
configuration.

### A note on Supabase

The app uses Supabase (or Neon, or RDS) purely as **Postgres**. It does not use Supabase
Auth — sessions are this app's own bcrypt + JWT, in `src/lib/auth.ts` — and it does not
use PostgREST, because the ranking queries in `src/lib/leaderboard.ts` are hand-written
SQL that an auto-generated REST layer can't express well.

`src/utils/supabase/` holds the standard browser and server clients for anything that
does want the Supabase SDK later (storage, realtime channels, edge functions). Nothing in
the game calls them today.

If you use Supabase, note that `db/schema.sql` creates plain tables with no row-level
security policies. That is safe here because every query runs server-side through
`DATABASE_URL` with the Postgres role, and the browser never talks to the database
directly. Enable RLS before pointing any client-side Supabase call at these tables.

---

## Things I'd do next

- Rate-limit signup and login. Right now nothing stops someone hammering either.
- Move the leaderboard fingerprint to Postgres `LISTEN`/`NOTIFY`, or Redis pub/sub, so
  the stream is push-driven rather than polling — the poll is fine for one instance but
  doesn't coordinate across several.
- Cache the global board. It changes constantly during a busy period but is identical for
  every viewer, so it's the obvious thing to put behind a short TTL.
- Record click timestamps and check the *distribution*, not just the total. Human clicking
  has jitter; an autoclicker is suspiciously periodic. That catches the patient cheater
  the current rate limit lets through.
- Unit tests. `scripts/smoke.sh` covers the API end to end, but there's no test runner in
  the repo and the React components aren't covered at all.
