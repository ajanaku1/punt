#!/usr/bin/env bash
# Judge-facing demo: two phones + three AI jurors with a printed checklist.
#
#   npm run demo:judge
#
# Default transport is Hyperswarm DHT (same as production path).
# Venue Wi-Fi killing DHT? Re-run with:
#   PUNT_FEED_LOCAL=1 npm run demo:judge
#
# Prereqs: .env with funded CREATOR+JOINER, deployed contracts, FOOTBALL_DATA_KEY.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "No .env — run: node scripts/fund-wallets.js && node scripts/deploy.js"; exit 1; }
grep -q ESCROW_CONTRACT .env || { echo "Contracts not deployed — run: node scripts/deploy.js"; exit 1; }

LOCAL="${PUNT_FEED_LOCAL:-}"
if [ -d .stores ] && ! grep -q FEED_SECRET .env; then
  echo "▸ upgrading to the encrypted feed — clearing pre-encryption stores…"
  rm -rf .stores
fi

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT

export PUNT_FEED_LOCAL="${LOCAL}"

echo "▸ transport: $([ -n "$LOCAL" ] && echo 'localhost TCP (PUNT_FEED_LOCAL=1)' || echo 'Hyperswarm DHT (default)')"
echo "▸ starting creator peer (feed host)…"
if [ -n "$LOCAL" ]; then
  PUNT_ROLE=CREATOR PUNT_UI_PORT=9701 PUNT_FEED_LISTEN=9471 node packages/app/peer.js & pids+=($!)
else
  PUNT_ROLE=CREATOR PUNT_UI_PORT=9701 PUNT_FEED_LISTEN=1 node packages/app/peer.js & pids+=($!)
fi
sleep 8

echo "▸ starting joiner peer…"
if [ -n "$LOCAL" ]; then
  PUNT_ROLE=JOINER PUNT_UI_PORT=9702 PUNT_FEED_CONNECT=127.0.0.1:9471 node packages/app/peer.js & pids+=($!)
else
  PUNT_ROLE=JOINER PUNT_UI_PORT=9702 node packages/app/peer.js & pids+=($!)
fi

echo "▸ starting the jury (3 independent local LLMs)…"
for n in 1 2 3; do
  if [ -n "$LOCAL" ]; then
    PUNT_JUROR=$n PUNT_FEED_CONNECT=127.0.0.1:9471 node packages/juror/index.js & pids+=($!)
  else
    PUNT_JUROR=$n node packages/juror/index.js & pids+=($!)
  fi
done

sleep 6
echo "▸ opening the two phones…"
PUNT_ROLE=CREATOR PUNT_UI_PORT=9701 npx electron packages/app/main.cjs & pids+=($!)
PUNT_ROLE=JOINER  PUNT_UI_PORT=9702 npx electron packages/app/main.cjs & pids+=($!)

cat <<'EOF'

╔══════════════════════════════════════════════════════════════════════╗
║  PUNT — JUDGE CHECKLIST                                              ║
╠══════════════════════════════════════════════════════════════════════╣
║  Watch the stack HUD under the ticker:                               ║
║    PEARS = peer count · dht/local · enc                              ║
║    QVAC  = AI ready (on-device parse model)                           ║
║    WDK   = last tx short-hash after stake                            ║
║                                                                      ║
║  1. CREATOR phone: tap +                                             ║
║  2. Type a bet on a FINISHED real match, e.g.                        ║
║       Morocco beat Ecuador yesterday, 4 on it                        ║
║     (or any recently finished fixture football-data.org knows)       ║
║  3. Wait for on-device parse → POST (stake locks via WDK)             ║
║  4. JOINER phone: swipe RIGHT on the card (P2P replication)          ║
║  5. Terminal: three jurors print VERDICT (QVAC on-device)             ║
║  6. Winner toast: Settled on-chain · ecrecover · Basescan link       ║
║                                                                      ║
║  Zero-install proof (no app):                                        ║
║    docs/judge-in-5-minutes.md  → golden create/join/settle txs       ║
║    npm test · npm run jury:demo                                      ║
║                                                                      ║
║  Ctrl-C stops everything.                                            ║
╚══════════════════════════════════════════════════════════════════════╝

EOF

wait
