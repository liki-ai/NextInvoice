#!/bin/sh
# Nightly database dump, run by /etc/cron.d/nextinvoice-backup. Keeps the last 30 days.
set -eu
DIR=/opt/nextinvoice/backups
mkdir -p "$DIR"
FILE="$DIR/nextinvoice-$(date +%F-%H%M).sql.gz"
docker exec nextinvoice-db pg_dump -U nextinvoice -d nextinvoice --no-owner | gzip > "$FILE.tmp"
# An empty or truncated dump must not replace a good one.
[ "$(gzip -dc "$FILE.tmp" | head -c 200 | wc -c)" -gt 100 ]
mv "$FILE.tmp" "$FILE"
find "$DIR" -name 'nextinvoice-*.sql.gz' -mtime +30 -delete
