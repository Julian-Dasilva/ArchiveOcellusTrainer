#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  printf 'ASSERTION FAILED: %s\n' "$*"
  exit 1
}

ready() {
  printf 'ready %s\n' "$t"
}

install_browser() {
  mkdir -p "$WORK/bin"
  cat >"$WORK/bin/agent-browser" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >>"${FAKE_BROWSER_LOG}"
if [ "${FAIL_OPEN:-}" = 1 ]; then
  for arg in "$@"; do
    if [ "$arg" = open ]; then
      echo "chrome failed to start" >&2
      exit 1
    fi
  done
fi
exit 0
EOF
  chmod +x "$WORK/bin/agent-browser"
}

chrome() {
  FAKE_BROWSER_LOG="$WORK/browser.log" PATH="$WORK/bin:$PATH" VERIFY_DIR="$WORK/verify" "$ROOT/scripts/verify.sh" chrome >"$WORK/out.txt" 2>&1
}

chrome_launches() {
  install_browser
  ready
  chrome || { cat "$WORK/out.txt"; fail "chrome exited non-zero"; }
  grep -q "chrome: launched" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "no launch line"; }
  grep -q "open about:blank" "$WORK/browser.log" || { cat "$WORK/browser.log"; fail "about:blank was not opened"; }
  grep -q -- "--json eval 1+1" "$WORK/browser.log" || { cat "$WORK/browser.log"; fail "1+1 was not evaluated"; }
}

chrome_that_does_not_open_fails() {
  install_browser
  ready
  FAIL_OPEN=1 chrome
  local status=$?
  [[ "$status" -eq 1 ]] || { cat "$WORK/out.txt"; fail "chrome exited ${status}"; }
  grep -q "chrome: did not launch: chrome failed to start" "$WORK/out.txt" || { cat "$WORK/out.txt"; fail "the launch failure is not named"; }
}

failed=0
for t in \
  chrome_launches \
  chrome_that_does_not_open_fails; do
  if ("$t") >"$WORK/$t.log" 2>&1; then
    echo "PASS $t"
  else
    echo "FAIL $t"
    failed=1
  fi
  sed 's/^/  /' "$WORK/$t.log"
done
exit $failed
