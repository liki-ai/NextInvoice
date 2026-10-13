#!/usr/bin/env bash
# Ships the API in server/ to the production server and restarts it.
#   bash deploy/deploy.sh            (from the repository root)
# The database container and its data are left alone; only the api container is rebuilt.
set -euo pipefail

HOST="${DEPLOY_HOST:-root@159.69.58.37}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> copying code to $HOST"
ssh "$HOST" 'mkdir -p /opt/nextinvoice/server /opt/nextinvoice/backups'
tar -C "$ROOT/server" --exclude=node_modules --exclude=data --exclude=.env -cf - . | ssh "$HOST" 'rm -rf /opt/nextinvoice/server/src && tar -C /opt/nextinvoice/server -xf -'
scp -q "$ROOT/deploy/docker-compose.yml" "$ROOT/deploy/backup.sh" "$HOST:/opt/nextinvoice/"

echo "==> building and restarting"
ssh "$HOST" 'cd /opt/nextinvoice && chmod +x backup.sh && docker compose up -d --build 2>&1 | tail -8'

echo "==> waiting for the api"
ssh "$HOST" 'for i in $(seq 1 30); do out=$(curl -s -m 3 http://127.0.0.1:4100/health || true); case "$out" in *\"persist\":\"postgres\"*) echo "$out"; exit 0;; esac; sleep 1; done; echo "api did not come up:"; docker logs --tail 30 nextinvoice-api; exit 1'
