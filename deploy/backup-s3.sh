#!/usr/bin/env bash
# Daily database backup to Amazon S3, run by nextinvoice-backup.timer (02:00 Europe/Belgrade = Kosovo time).
#   Run now:   systemctl start nextinvoice-backup.service
#   Logs:      journalctl -u nextinvoice-backup
# Dumps with pg_dump (custom format) inside the db container, reads the whole dump back with pg_restore,
# then uploads it with S3 server-side encryption and checks the size S3 stored. Nothing is uploaded
# unless every check passed. The newest $KEEP_LOCAL dumps also stay on this disk for quick restores.
# AWS keys: /root/.aws (profile mynextinvoice-backup), entered on the server, never in git.
# Restoring: deploy/BACKUP-RESTORE.md.
set -euo pipefail
umask 077

BUCKET="${BACKUP_BUCKET:-tretek-mynextinvoice-db-backups}"
PREFIX="${BACKUP_PREFIX:-mynextinvoice/production/database/}"
export AWS_PROFILE="${AWS_PROFILE:-mynextinvoice-backup}"
export AWS_REGION="${AWS_REGION:-eu-north-1}"
CONTAINER=nextinvoice-db
DB=nextinvoice
DB_USER=nextinvoice
LOCAL_DIR="${BACKUP_DIR:-/opt/nextinvoice/backups}"
KEEP_LOCAL=3
MIN_FREE_MB=2048
# The dump is ~88 MB (October 2026); anything under this means the dump went wrong.
MIN_BYTES=1000000

exec 9>/run/nextinvoice-backup.lock
flock -n 9 || { echo "Another backup is still running; not starting a second one."; exit 1; }

mkdir -p "$LOCAL_DIR"
free_mb=$(df -Pm "$LOCAL_DIR" | awk 'NR==2 {print $4}')
[ "$free_mb" -ge "$MIN_FREE_MB" ] || { echo "Only ${free_mb} MB free in $LOCAL_DIR (need $MIN_FREE_MB); no backup made."; exit 1; }

NAME="nextinvoice-$(date -u +%Y-%m-%dT%H%M%SZ).dump"
TMP=$(mktemp -d "$LOCAL_DIR/.partial-XXXXXX")
trap 'rm -rf "$TMP"' EXIT

echo "Dumping database $DB"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB" -Fc --no-owner > "$TMP/$NAME"

# Reading every byte back proves the archive is complete; the table list proves it is the right database.
docker exec -i "$CONTAINER" pg_restore -f /dev/null < "$TMP/$NAME"
docker exec -i "$CONTAINER" pg_restore --list < "$TMP/$NAME" > "$TMP/toc"
for table in app_documents finance_files; do
  grep -q "TABLE DATA public $table " "$TMP/toc" || { echo "Dump has no data for table $table; not uploading."; exit 1; }
done
size=$(stat -c %s "$TMP/$NAME")
[ "$size" -ge "$MIN_BYTES" ] || { echo "Dump is only $size bytes; not uploading."; exit 1; }
(cd "$TMP" && sha256sum "$NAME" > "$NAME.sha256")
mv "$TMP/$NAME" "$TMP/$NAME.sha256" "$LOCAL_DIR/"
echo "Dump verified: $NAME, $size bytes"

upload() {
  local file=$1 key=$PREFIX$(basename "$1") try stored
  for try in 1 2 3; do
    if aws s3 cp --only-show-errors --sse AES256 "$file" "s3://$BUCKET/$key"; then
      stored=$(aws s3api head-object --bucket "$BUCKET" --key "$key" --query ContentLength --output text)
      if [ "$stored" = "$(stat -c %s "$file")" ] && [ "$stored" -gt 0 ]; then
        echo "Uploaded s3://$BUCKET/$key ($stored bytes)"
        return 0
      fi
      echo "S3 holds $stored bytes for $key, expected $(stat -c %s "$file")."
    fi
    [ "$try" -lt 3 ] && { echo "Upload try $try failed; retrying in $((try * 60)) s."; sleep $((try * 60)); }
  done
  return 1
}
upload "$LOCAL_DIR/$NAME" || { echo "Upload failed; the dump is kept at $LOCAL_DIR/$NAME."; exit 1; }
upload "$LOCAL_DIR/$NAME.sha256" || { echo "Checksum upload failed."; exit 1; }

# Only after a good upload: keep the newest $KEEP_LOCAL dumps on this disk.
ls -1t "$LOCAL_DIR"/nextinvoice-*.dump | tail -n +$((KEEP_LOCAL + 1)) | while read -r old; do
  rm -f "$old" "$old.sha256"
done
echo "Backup finished."
