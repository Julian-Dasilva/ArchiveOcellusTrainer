#!/usr/bin/env bash
set -euo pipefail

node --import ./scripts/openrs2-download-diagnostics.mjs "$(command -v osrs-sdk-assets)" build "$@"
npm run --silent item-icons -- "$@"
node scripts/extract-sprites.mjs "$@"
