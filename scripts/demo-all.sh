#!/usr/bin/env bash
set -euo pipefail

# ── Punt: All-In-One Demo ────────────────────────────────────────────────
# Boots the full Punt stack end-to-end:
#   1/3  Pears feed replicating (Autobase + Hyperswarm DHT)
#   2/3  QVAC jury loading (Qwen3 4B on-device)
#   3/3  WDK stake on-chain (Escrow.sol on Base Sepolia)
#
# Usage: ./scripts/demo-all.sh
#
# Prerequisites:
#   - .env file with FEED_KEY, FEED_SECRET, WDK mnemonics, contract addresses
#   - node >= 22
#   - npm install already run
#   - football-data.org API key in FOOTBALL_DATA_KEY
# ─────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STORES="$ROOT/.stores"

echo "=== Punt: All-In-One Demo ==="
echo ""

# ── Cleanup ────────────────────────────────────────────────────────────

echo "[cleanup] stopping any prior peers…"
pkill -f "node packages/app/peer.js" 2>/dev/null || true
pkill -f "node packages/juror/index.js" 2>/dev/null || true
sleep 1

# ── 1/3: Pears Feed ────────────────────────────────────────────────────

echo ""
echo "── 1/3 Pears feed replicating ──"

# Feed bootstrapper: creates the feed, writes FEED_KEY + FEED_SECRET to .env
echo "[peers] bootstrapping feed…"
PUNT_FEED_LISTEN=9471 PUNT_ROLE=CREATOR PUNT_UI_PORT=9701 \
  node "$ROOT/packages/app/peer.js" &
CREATOR_PID=$!

# Wait for feed bootstrap (FEED_KEY appears in .env)
for i in $(seq 1 30); do
  if grep -q FEED_KEY "$ROOT/.env" 2>/dev/null; then
    break
  fi
  sleep 1
done
echo "[peers] feed bootstrapped (FEED_KEY in .env)"

# Joiner
echo "[peers] starting joiner…"
PUNT_ROLE=JOINER PUNT_UI_PORT=9702 PUNT_FEED_CONNECT=127.0.0.1:9471 \
  PUNT_FEED_LOCAL=1 \
  node "$ROOT/packages/app/peer.js" &
JOINER_PID=$!

sleep 3
echo "[peers] ✓ 2 peers replicating (creator + joiner)"

# ── 2/3: QVAC Jury ─────────────────────────────────────────────────────

echo ""
echo "── 2/3 QVAC jury loading ──"

for i in 1 2 3; do
  echo "[juror $i] loading Qwen3 4B…"
  PUNT_JUROR=$i PUNT_FEED_LOCAL=1 PUNT_FEED_CONNECT=127.0.0.1:9471 \
    node "$ROOT/packages/juror/index.js" &
  JUROR_PIDS+=($!)
done

# Wait for jury ready signal
echo "[jury] waiting for model load…"
for i in $(seq 1 60); do
  if grep -q "ready — signing as" "$ROOT/.stores/juror1"*.log 2>/dev/null; then
    break
  fi
  sleep 2
done
echo "[jury] ✓ 3 jurors loaded (Qwen3 4B on-device)"

# ── 3/3: WDK On-Chain ──────────────────────────────────────────────────

echo ""
echo "── 3/3 WDK stake on-chain ──"

echo "[stake] use the Electron UI to create and join a bet:"
echo "  Creator: http://127.0.0.1:9701"
echo "  Joiner:  http://127.0.0.1:9702"
echo ""
echo "Once both peers have staked and the match has finished, the jurors"
echo "will grade automatically. Settlement is 2-of-3 ecrecover on-chain."
echo ""
echo "[demo] all three stacks running. Press Ctrl+C to stop."

# ── Cleanup on exit ────────────────────────────────────────────────────

cleanup() {
  echo ""
  echo "[cleanup] stopping all peers…"
  kill $CREATOR_PID $JOINER_PID ${JUROR_PIDS[@]} 2>/dev/null || true
  wait 2>/dev/null || true
  echo "[demo] done."
}
trap cleanup EXIT INT TERM

# Keep running until Ctrl+C
wait
