#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -n "${CF_WEB_ANALYTICS_TOKEN:-}" ]]; then
  echo "release-build: CF_WEB_ANALYTICS_TOKEN is set, so this build would ship the analytics beacon" >&2
  exit 1
fi
unset CF_WEB_ANALYTICS_TOKEN
export ARCHIVE_LOADOUT=off

if [[ -n "${NETLIFY_CACHE_DIR:-}" ]]; then
  cache_root="${NETLIFY_CACHE_DIR}/archive-ocellus"
  export OSRS_CACHE_DIR="${OSRS_CACHE_DIR:-${cache_root}/openrs2}"
  if [[ -z "${OSRS_CACHE_READER:-}" ]]; then
    OSRS_CACHE_READER=""
    for candidate in "${cache_root}"/osrscachereader-*; do
      [[ -d "${candidate}" ]] || continue
      OSRS_CACHE_READER="${candidate}"
      break
    done
    export OSRS_CACHE_READER
    if [[ -z "${OSRS_CACHE_READER}" ]]; then
      echo "release-build: no cache reader under ${cache_root}" >&2
      exit 1
    fi
  fi
fi

rm -rf public/osrs-assets
scripts/verify.sh assets
npm run build
node_modules/.bin/tsx src/releaseBundle/check.ts dist
