#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

dist="${RELEASE_DIST:-dist}"
port="${RELEASE_PORT:-8038}"

if [[ ! -f "$dist/index.html" ]]; then
  echo "release-browser: $dist has no index.html" >&2
  exit 1
fi
if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "release-browser: port $port is in use" >&2
  exit 1
fi

log="${TMPDIR:-/tmp}/release-browser-$port.log"
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$dist" >"$log" 2>&1 &
server=$!
cleanup() {
  if kill -0 "$server" 2>/dev/null; then
    kill "$server" 2>/dev/null || true
    wait "$server" 2>/dev/null || true
  fi
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 50); do
  if curl -sf -o /dev/null "http://127.0.0.1:$port/"; then
    ready=1
    break
  fi
  sleep 0.1
done
if [[ "$ready" != 1 ]]; then
  echo "release-browser: $dist did not answer on $port" >&2
  exit 1
fi

export RELEASE_BROWSER=1
node_modules/.bin/tsx src/releaseBundle/walk.ts "http://127.0.0.1:$port"
