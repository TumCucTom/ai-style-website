#!/bin/bash
# scripts/chess-refresh.sh
# Refresh chess.com stats for @reewyyn, commit and push if changed.
# Invoked by ~/Library/LaunchAgents/com.tombale.chess-fetch.plist every 4h.
# The GitHub Action (.github/workflows/refresh-chess.yml) does the same
# thing on the same cadence — the two coexist idempotently. Whichever
# fires first pushes; the other's rebase sees no diff and exits.
set -euo pipefail

cd /Users/tom/personal-website/site

# Sync with remote first so a concurrent GH-action commit doesn't make
# our push non-fast-forward.
git fetch origin main --quiet
git rebase origin/main --quiet 2>/dev/null || {
  echo "rebase conflict — skipping this run" >&2
  exit 0
}

# Fetch fresh chess data
node scripts/chess.mjs

# Commit and push if changed
if git diff --quiet data/live-chess.json; then
  echo "live-chess.json unchanged — nothing to commit"
  exit 0
fi

git add data/live-chess.json
git commit -m "refresh: live-chess.json [skip ci]" \
  -m "Co-Authored-By: Zippy AI <tomkinsbale@icloud.com>"
git push origin main --quiet
echo "live-chess.json pushed at $(date -u +%FT%TZ)"
