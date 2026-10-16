# Database backups: how they run and how to restore one

Production database: PostgreSQL 17 in the container `nextinvoice-db` on `root@159.69.58.37`
(data in `/opt/nextinvoice/pgdata`, database and user `nextinvoice`).

## What runs

| | |
|---|---|
| Script | `/opt/nextinvoice/backup-s3.sh` (source: `deploy/backup-s3.sh`, shipped by `deploy/deploy.sh`) |
| Schedule | `nextinvoice-backup.timer`, every day 02:00 Europe/Belgrade (Kosovo time); a run missed while the server was off happens at the next boot |
| Units | `/etc/systemd/system/nextinvoice-backup.{service,timer}` (source: `deploy/systemd/`) |
| Format | `pg_dump -Fc` (PostgreSQL custom format, compressed), about 90 MB |
| Name | `nextinvoice-YYYY-MM-DDTHHMMSSZ.dump` (UTC) plus `.dump.sha256` |
| S3 | `s3://tretek-mynextinvoice-db-backups/mynextinvoice/production/database/`, region `eu-north-1`, SSE-S3 (AES256) |
| On the server | nothing once the upload is confirmed (since 2026-10-16, the user's choice); a dump whose upload failed stays in `/opt/nextinvoice/backups/` until the next good run |
| AWS keys | `/root/.aws/credentials`, profile `mynextinvoice-backup` (root, 0600); never in git |

Each run: checks free disk space, dumps into a hidden temporary folder, reads the whole dump back with
`pg_restore`, checks both tables are in it and its size, writes a sha256, uploads with retries, and
compares the size S3 stored with the local file. A failed or partial dump is never uploaded. A lock stops
two runs overlapping. The weekly cron job (`/etc/cron.d/nextinvoice-backup`) was removed on 2026-10-16.

The API keeps data in memory and writes changes to Postgres a few seconds after they happen, so a dump
holds everything saved up to its start time.

## Manual backup and logs

```bash
ssh root@159.69.58.37
systemctl start nextinvoice-backup.service          # waits until done; exit code 0 = success
journalctl -u nextinvoice-backup -n 50 --no-pager   # log of recent runs
systemctl list-timers nextinvoice-backup.timer      # next and last run
systemctl status nextinvoice-backup.service         # result of the last run
AWS_PROFILE=mynextinvoice-backup aws s3 ls s3://tretek-mynextinvoice-db-backups/mynextinvoice/production/database/
```

## Restore test (into a throwaway database; production is not touched)

Run on the server as root. The test container has no network and no disk volume, and is removed at the end.

```bash
export AWS_PROFILE=mynextinvoice-backup AWS_REGION=eu-north-1
B=tretek-mynextinvoice-db-backups P=mynextinvoice/production/database/
KEY=$(aws s3api list-objects-v2 --bucket $B --prefix ${P}nextinvoice- \
  --query 'sort_by(Contents[?ends_with(Key,`.dump`)],&LastModified)[-1].Key' --output text)   # or pick a key from `aws s3 ls`
T=$(mktemp -d /root/restoretest.XXXX)
aws s3 cp s3://$B/$KEY "$T/"; aws s3 cp s3://$B/$KEY.sha256 "$T/"
(cd "$T" && sha256sum -c *.sha256)                                    # must print OK

docker run -d --name nextinvoice-restoretest --network none --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=restoretest postgres:17-alpine
until docker exec nextinvoice-restoretest pg_isready -q -h 127.0.0.1 -U postgres; do sleep 1; done
docker exec -i nextinvoice-restoretest pg_restore -U postgres -d restoretest --no-owner --exit-on-error < "$T"/*.dump

docker exec nextinvoice-restoretest psql -U postgres -d restoretest -c \
  "select (select count(*) from app_documents) docs, (select count(*) from finance_files) files"

docker rm -f nextinvoice-restoretest; rm -rf "$T"                     # clean up
```

Tested on 2026-10-16 with `nextinvoice-2026-10-16T085431Z.dump`: checksum OK, `pg_restore` without
errors in 3 s, all 598 `finance_files` rows identical to production, 12 of 14 `app_documents` identical
and the other 2 changed in production after the dump time.

## Restoring production (only after a real loss; decide first, it replaces live data)

1. Take a fresh dump of whatever is there now: `systemctl start nextinvoice-backup.service`.
2. Stop the API so it cannot write its in-memory copy back: `cd /opt/nextinvoice && docker compose stop api`.
3. Restore into the production database, replacing its tables:
   `docker exec -i nextinvoice-db pg_restore -U nextinvoice -d nextinvoice --no-owner --clean --if-exists --single-transaction --exit-on-error < /path/to/backup.dump`
4. Start the API (`docker compose start api`) and check `curl -s http://127.0.0.1:4100/health` shows `"persist":"postgres"`.

## Retention (S3 lifecycle, not applied yet; needs an admin, the backup user cannot change bucket settings)

The backup user can write and read under the prefix but cannot read or change bucket settings
(versioning, encryption, lifecycle). Rule to keep 30 days of daily backups, in
S3 console > bucket > Management > Lifecycle rules, or with an admin profile:

```json
{
  "Rules": [{
    "ID": "mynextinvoice-db-30-days",
    "Status": "Enabled",
    "Filter": { "Prefix": "mynextinvoice/production/database/" },
    "Expiration": { "Days": 31 },
    "NoncurrentVersionExpiration": { "NoncurrentDays": 1 },
    "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
  }, {
    "ID": "mynextinvoice-db-delete-markers",
    "Status": "Enabled",
    "Filter": { "Prefix": "mynextinvoice/production/database/" },
    "Expiration": { "ExpiredObjectDeleteMarker": true }
  }]
}
```

```bash
aws s3api put-bucket-lifecycle-configuration --bucket tretek-mynextinvoice-db-backups --lifecycle-configuration file://lifecycle.json
```

31 days, not 30, so a full 30 daily restore points always exist. If versioning is on, expiry only adds a
delete marker; `NoncurrentVersionExpiration` then removes the old version a day later, and the second rule
removes the delete marker once nothing is left under it. Without these rules nothing is ever deleted.

Cost at about 90 MB per day: 30 copies are about 2.7 GB, roughly USD 0.07 per month in S3 Standard
(eu-north-1), plus well under USD 0.01 per month for uploads. Downloading a backup for a restore costs a
few cents at most.
