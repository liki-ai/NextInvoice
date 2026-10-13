#!/bin/sh
# Weekly database dump, run by /etc/cron.d/nextinvoice-backup (Sundays 02:15). Keeps the newest 5.
set -eu
DIR="${BACKUP_DIR:-/opt/nextinvoice/backups}"
KEEP=5
mkdir -p "$DIR"
FILE="$DIR/nextinvoice-$(date +%F-%H%M).sql.gz"
docker exec nextinvoice-db pg_dump -U nextinvoice -d nextinvoice --no-owner | gzip > "$FILE.tmp"
# An empty or truncated dump must not count as a backup, nor push a good one out.
[ "$(gzip -dc "$FILE.tmp" | head -c 200 | wc -c)" -gt 100 ]
mv "$FILE.tmp" "$FILE"
# Only after the new dump is in place: drop everything but the newest $KEEP.
ls -1t "$DIR"/nextinvoice-*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
