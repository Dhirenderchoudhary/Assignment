#!/usr/bin/env bash
#
# End-to-end smoke test against a running server.
#
#   npm run dev            # in one terminal
#   npm run smoke          # in another
#
# Exercises the whole API: signup, validation, a real timed run, every
# anti-cheat rejection path, all three leaderboard periods, the profile, and
# the auth redirects. Takes about 35 seconds because it waits out two real
# 15-second Sprint clocks rather than faking them.
#
# Override the target with BASE_URL=https://... npm run smoke
set -u

BASE="${BASE_URL:-http://localhost:3000}"
JAR="$(mktemp -t clickrush-cookies)"
trap 'rm -f "$JAR"' EXIT

pass=0
fail=0

check() { # check <label> <expected> <actual> [body]
  if [ "$2" = "$3" ]; then
    printf '  ok    %s (%s)\n' "$1" "$3"
    pass=$((pass + 1))
  else
    printf '  FAIL  %s — expected %s, got %s :: %s\n' "$1" "$2" "$3" "${4:-}"
    fail=$((fail + 1))
  fi
}

req() { # req <METHOD> <PATH> [json] -> STATUS, BODY
  local out
  if [ -n "${3:-}" ]; then
    out=$(curl -s -w '\n%{http_code}' -c "$JAR" -b "$JAR" -X "$1" \
      -H 'Content-Type: application/json' -d "$3" "$BASE$2")
  else
    out=$(curl -s -w '\n%{http_code}' -c "$JAR" -b "$JAR" -X "$1" "$BASE$2")
  fi
  STATUS=$(printf '%s' "$out" | tail -1)
  BODY=$(printf '%s' "$out" | sed '$d')
}

status_of() { # status_of <PATH>
  curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$BASE$1"
}

if ! curl -sf -o /dev/null "$BASE/api/auth/me"; then
  echo "No server responding at $BASE. Start one with: npm run dev"
  exit 1
fi

USER="smoke$$$RANDOM"
PASSWORD="correct-horse-battery"

echo "== auth =="
req POST /api/game/start '{"mode":"classic"}'
check "anonymous cannot start a game" 401 "$STATUS" "$BODY"

req POST /api/auth/signup '{"username":"ab","email":"nope","password":"short"}'
check "signup rejects bad input" 400 "$STATUS" "$BODY"

req POST /api/auth/signup "{\"username\":\"$USER\",\"email\":\"$USER@example.test\",\"password\":\"$PASSWORD\"}"
check "signup" 201 "$STATUS" "$BODY"

req POST /api/auth/signup "{\"username\":\"$USER\",\"email\":\"other-$USER@example.test\",\"password\":\"$PASSWORD\"}"
check "duplicate username rejected" 409 "$STATUS" "$BODY"

req GET /api/auth/me
check "me returns the new user" 200 "$STATUS" "$BODY"

echo "== a real 15s run =="
req POST /api/game/start '{"mode":"sprint"}'
check "start sprint" 200 "$STATUS" "$BODY"
SESSION=$(printf '%s' "$BODY" | sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p')

req POST /api/game/finish "{\"sessionId\":\"$SESSION\",\"clicks\":50}"
check "finishing early rejected" 400 "$STATUS" "$BODY"

echo "  (waiting out the clock)"
sleep 15

req POST /api/game/finish "{\"sessionId\":\"$SESSION\",\"clicks\":91}"
check "valid run accepted" 201 "$STATUS" "$BODY"
printf '        %s\n' "$BODY"

req POST /api/game/finish "{\"sessionId\":\"$SESSION\",\"clicks\":91}"
check "replaying the same session rejected" 409 "$STATUS" "$BODY"

echo "== anti-cheat =="
req POST /api/game/start '{"mode":"sprint"}'
SESSION2=$(printf '%s' "$BODY" | sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p')
echo "  (waiting out the clock)"
sleep 15
req POST /api/game/finish "{\"sessionId\":\"$SESSION2\",\"clicks\":9000}"
check "impossible click rate rejected" 422 "$STATUS" "$BODY"

req POST /api/game/start '{"mode":"nonsense"}'
check "unknown mode rejected" 400 "$STATUS" "$BODY"

req POST /api/game/finish '{"sessionId":"not-a-uuid","clicks":5}'
check "malformed session id rejected" 400 "$STATUS" "$BODY"

req POST /api/game/finish '{"sessionId":"3f1b7c9e-5a2d-4f6b-9c3e-8d7a1b2c4e5f","clicks":5}'
check "unknown session rejected" 404 "$STATUS" "$BODY"

echo "== leaderboards =="
for period in global daily weekly; do
  req GET "/api/leaderboard?mode=sprint&period=$period"
  check "leaderboard $period" 200 "$STATUS" "$BODY"
done
req GET "/api/leaderboard?mode=all&period=global"
check "combined leaderboard" 200 "$STATUS" "$BODY"
req GET "/api/leaderboard?period=bogus"
check "unknown period rejected" 400 "$STATUS" "$BODY"

echo "== profile =="
req GET /api/profile
check "profile" 200 "$STATUS" "$BODY"

echo "== pages =="
for path in / /leaderboard /profile; do
  check "GET $path" 200 "$(status_of "$path")"
done
for path in /login /signup; do
  check "GET $path redirects when signed in" 307 "$(status_of "$path")"
done

echo "== session =="
req POST /api/auth/logout
check "logout" 200 "$STATUS" "$BODY"
req GET /api/profile
check "profile API locked after logout" 401 "$STATUS" "$BODY"
check "profile page redirects when signed out" 307 "$(status_of /profile)"

req POST /api/auth/login "{\"email\":\"$USER@example.test\",\"password\":\"wrong-password\"}"
check "wrong password rejected" 401 "$STATUS" "$BODY"
req POST /api/auth/login "{\"email\":\"$USER@example.test\",\"password\":\"$PASSWORD\"}"
check "login" 200 "$STATUS" "$BODY"

echo
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
