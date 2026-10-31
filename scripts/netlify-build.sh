#!/usr/bin/env bash
set -euo pipefail

OSRS_CACHE_READER_REPO="${OSRS_CACHE_READER_REPO:-https://github.com/Julian-Dasilva/osrscachereader.git}"
OSRS_CACHE_READER_COMMIT="${OSRS_CACHE_READER_COMMIT:-8ba9131f1afd1193e7c6180db5a895ffe9e21fa8}"
export NETLIFY_CACHE_DIR="${NETLIFY_CACHE_DIR:-/opt/build/cache}"
CACHE_ROOT="${NETLIFY_CACHE_DIR}/archive-ocellus"
READER="${CACHE_ROOT}/osrscachereader-${OSRS_CACHE_READER_COMMIT}"

cd "$(dirname "$0")/.."

prepare_reader() {
  find "${CACHE_ROOT}" -mindepth 1 -maxdepth 1 -name 'osrscachereader*' ! -path "${READER}" -exec rm -rf {} +
  if [[ -d "${READER}" ]]; then
    echo "netlify-build: reusing cache reader ${OSRS_CACHE_READER_COMMIT}"
    return 0
  fi
  echo "netlify-build: installing cache reader ${OSRS_CACHE_READER_REPO} at ${OSRS_CACHE_READER_COMMIT}"
  local unpublished_reader
  unpublished_reader="$(mktemp -d "${CACHE_ROOT}/osrscachereader.XXXXXX")"
  git init --quiet "${unpublished_reader}"
  git -C "${unpublished_reader}" fetch --quiet --depth 1 "${OSRS_CACHE_READER_REPO}" "${OSRS_CACHE_READER_COMMIT}"
  git -C "${unpublished_reader}" checkout --quiet FETCH_HEAD
  (cd "${unpublished_reader}" && npm ci --no-audit --no-fund)
  mv "${unpublished_reader}" "${READER}"
}

mkdir -p "${CACHE_ROOT}"
OPENRS2_CACHE_ID="$(node -e '
  const config = require("node:fs").readFileSync("osrs-assets.config.ts", "utf8");
  const ids = [...config.matchAll(/\bopenrs2:\s*(\d+)\b/g)];
  if (ids.length !== 1) throw new Error("expected one configured OpenRS2 cache id");
  console.log(ids[0][1]);
')"
if [[ -d "${CACHE_ROOT}/openrs2" ]]; then
  find "${CACHE_ROOT}/openrs2" -mindepth 1 -maxdepth 1 -type d ! -name "${OPENRS2_CACHE_ID}" -exec rm -rf {} +
fi
prepare_reader
npm ci --no-audit --no-fund
scripts/install-beta-sdk.sh
npm run assets -- \
  --cache-dir "${CACHE_ROOT}/openrs2" --reader-path "${READER}"
npm run build
