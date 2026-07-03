#!/usr/bin/env bash
# One-command demo: two users (phone-shaped windows) + three AI jurors,
# all separate processes on this machine, no server anywhere.
#
#   npm run demo
#
# Prereqs: .env with funded wallets + deployed contracts (see README),
# and a football-data.org key in FOOTBALL_DATA_KEY.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "No .env — run: node scripts/fund-wallets.js && node scripts/deploy.js"; exit 1; }
grep -q ESCROW_CONTRACT .env || { echo "Contracts not deployed — run: node scripts/deploy.js"; exit 1; }

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT

echo "▸ starting creator peer (feed host)…"
PUNT_ROLE=CREATOR PUNT_UI_PORT=9701 PUNT_FEED_LISTEN=9471 node packages/app/peer.js & pids+=($!)
sleep 8

echo "▸ starting joiner peer…"
PUNT_ROLE=JOINER PUNT_UI_PORT=9702 PUNT_FEED_CONNECT=127.0.0.1:9471 node packages/app/peer.js & pids+=($!)

echo "▸ starting the jury (3 independent local LLMs)…"
for n in 1 2 3; do
  PUNT_JUROR=$n PUNT_FEED_CONNECT=127.0.0.1:9471 node packages/juror/index.js & pids+=($!)
done

sleep 6
echo "▸ opening the two phones…"
PUNT_ROLE=CREATOR PUNT_UI_PORT=9701 npx electron packages/app/main.cjs & pids+=($!)
PUNT_ROLE=JOINER  PUNT_UI_PORT=9702 npx electron packages/app/main.cjs & pids+=($!)

echo
echo "Demo is live. Post a bet on the creator phone; swipe right on the joiner phone."
echo "Juror verdicts print here. Ctrl-C stops everything."
wait
