#!/usr/bin/env bash
# Gives the production database a new random password and keeps it in one place only:
# /opt/nextinvoice/secrets/db_password, readable by root and by the api container (group 4100).
# It is not in .env, and no container setting shows it (`docker inspect`, `env`).
# Ships the API in server/ along the way. If the API does not come back, the previous password,
# .env and compose file are put back.
#   bash deploy/rotate-db-password.sh            (from the repository root)
# The first run also moves the password out of .env (POSTGRES_PASSWORD); later runs just change it.
set -euo pipefail

HOST="${DEPLOY_HOST:-root@159.69.58.37}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> preparing a new password"
ssh "$HOST" bash -s <<'REMOTE'
set -eu
cd /opt/nextinvoice
umask 077
mkdir -p secrets
chmod 700 secrets
# The password in use now: in .env the first time, in the secret file afterwards.
OLD=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env | tail -n 1)
[ -n "$OLD" ] || OLD=$(cat secrets/db_password 2>/dev/null || true)
[ -n "$OLD" ] || { echo "No current database password found; nothing changed."; exit 1; }
printf '%s' "$OLD" > secrets/rollback-password
cp .env secrets/rollback.env
cp docker-compose.yml secrets/rollback-compose.yml
openssl rand -hex 32 | tr -d '\n' > secrets/db_password.new
chown root:4100 secrets/db_password.new
chmod 0440 secrets/db_password.new
REMOTE

echo "==> copying the code and building the api"
tar -C "$ROOT/server" --exclude=node_modules --exclude=data --exclude=.env -cf - . | ssh "$HOST" 'rm -rf /opt/nextinvoice/server/src && tar -C /opt/nextinvoice/server -xf -'
scp -q "$ROOT/deploy/docker-compose.yml" "$HOST:/opt/nextinvoice/docker-compose.next.yml"
scp -q "$ROOT/deploy/backup.sh" "$HOST:/opt/nextinvoice/"
ssh "$HOST" bash -s <<'REMOTE'
set -eu
cd /opt/nextinvoice
chmod +x backup.sh
# The new compose file wants the secret in place; the new password stands in for the build only.
cp -p secrets/db_password.new secrets/db_password
docker compose -f docker-compose.next.yml build api 2>&1 | tail -3
REMOTE

echo "==> switching the database to the new password"
ssh "$HOST" bash -s <<'REMOTE'
set -u
cd /opt/nextinvoice
healthy() {
  for i in $(seq 1 40); do
    out=$(curl -s -m 3 http://127.0.0.1:4100/health || true)
    case "$out" in *\"persist\":\"postgres\"*) echo "$out"; return 0;; esac
    sleep 1
  done
  return 1
}
NEW=$(cat secrets/db_password.new)
printf "ALTER ROLE nextinvoice PASSWORD '%s';\n" "$NEW" | docker exec -i nextinvoice-db psql -q -v ON_ERROR_STOP=1 -U nextinvoice -d nextinvoice || { echo "The database refused the new password; nothing changed."; rm -f docker-compose.next.yml; exit 1; }
mv docker-compose.next.yml docker-compose.yml
sed -i '/^POSTGRES_PASSWORD=/d' .env
docker compose up -d 2>&1 | tail -4
if healthy && ! docker inspect nextinvoice-api nextinvoice-db --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -q -e "$NEW" -e '^POSTGRES_PASSWORD='; then
  rm -f secrets/db_password.new secrets/rollback-password secrets/rollback.env secrets/rollback-compose.yml
  echo "DONE: the database password is now only in /opt/nextinvoice/secrets/db_password"
  exit 0
fi
echo "The api did not come back with the new password; putting the previous one back."
OLD=$(cat secrets/rollback-password)
printf "ALTER ROLE nextinvoice PASSWORD '%s';\n" "$OLD" | docker exec -i nextinvoice-db psql -q -v ON_ERROR_STOP=1 -U nextinvoice -d nextinvoice
cp secrets/rollback.env .env
cp secrets/rollback-compose.yml docker-compose.yml
docker compose up -d 2>&1 | tail -4
healthy || docker logs --tail 30 nextinvoice-api
exit 1
REMOTE
