#!/bin/bash
# Polls the Fuji balance of the deployer; as soon as it's funded (>= 0.15 AVAX
# for ~6.7M gas of deployment at testnet prices), runs the Deploy script.
# Usage: ./scripts/wait-and-deploy.sh [max_minutes]
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.foundry/bin:$PATH"
source .env

RPC="https://api.avax-test.network/ext/bc/C/rpc"
MIN_WEI=150000000000000000 # 0.15 AVAX
MAX_MINUTES="${1:-120}"
DEADLINE=$(( $(date +%s) + MAX_MINUTES * 60 ))

echo "Watching $DEPLOYER_ADDRESS on Fuji (up to $MAX_MINUTES min)..."
while true; do
  BAL=$(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC" 2>/dev/null || echo 0)
  if [ "$(echo "$BAL >= $MIN_WEI" | bc)" = "1" ]; then
    echo "Funded: $BAL wei. Deploying..."
    forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast 2>&1 | tee deploy-fuji.log
    exit 0
  fi
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "Timed out waiting for funding. Current balance: $BAL wei."
    exit 2
  fi
  sleep 30
done
