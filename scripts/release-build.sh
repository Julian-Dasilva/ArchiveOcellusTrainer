#!/usr/bin/env bash
# Webpack's default leaves ARCHIVE_FULL off, so `npm run build` stays the P4-only bundle.
set -euo pipefail
cd "$(dirname "$0")/.."
export ARCHIVE_FULL=on
export ARCHIVE_P1=off
export ARCHIVE_P2=off
export ARCHIVE_P3=off
rm -rf public/osrs-assets
scripts/verify.sh assets
npm run build
