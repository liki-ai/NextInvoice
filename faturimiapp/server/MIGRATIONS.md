# Data migration and restore

Server hydration is in-place and per-user. It does not rewrite other accounts.

## v1 — invoices, obligations, clients

Applied on first read after this code is deployed (`db.migrations[userId].v = 1`).

- Existing invoices are treated as **issued**. They keep their number, totals, and paid/unpaid flag.
- Paid documents with no payment rows stay paid. Remaining = 0. **No payment date is invented.**
- `companySnapshot` is left empty (`snapshotSource: "migrated"`). Old PDFs use the live profile until the invoice is issued again or corrected; the UI must not present that as a verified historical snapshot.
- `clientSnapshot` is copied from the invoice’s current client block as best available data.
- Clients are seeded from unique name + phone + email + address + business id. Same name alone does not merge people.
- Obligations keep proof files and gain an empty `payments` list.

## v2 — VAT setting per client

Applied on first read after this code is deployed (`db.migrations[userId].v = 2`).

- Clients gain `taxRate`: `null` follows the company default, `0` means no VAT (an export customer), any other number is that client's own rate. It only sets what a new invoice starts with.
- A client with no setting whose invoices imported from a spreadsheet were all at 0% is set to `0`. Imported invoices are the only ones whose 0% is known to be deliberate, so accounts that never imported are not touched.
- Invoices are not changed.

## Backup and restore

`GET /api/sync/backup` returns `{ version, exportedAt, userId, checksum, data }`.

`POST /api/sync/backup/restore` replaces **only that user’s** invoices, obligations, clients, and profile.

- Body must include `confirm: "RESTORE"`.
- If `checksum` is sent, it must match `sha256(JSON.stringify(data))`.
- Do not run restore against production data without an explicit operator request.

## Where the data lives

Accounts, profiles, invoices, clients, items and obligations are stored in Postgres (`DATABASE_URL`), in the table `app_documents`:

| key | holds |
|-----|-------|
| `users`, `passwordResets` | one document each |
| `profiles/<userId>`, `invoices/<userId>`, `clients/<userId>`, `items/<userId>`, `obligations/<userId>`, `syncOps/<userId>`, `migrations/<userId>` | one document per user |
| `mail/<userId>` | the company's mailbox connection for sending invoices; its password is encrypted with a key derived from `MAIL_SECRET` (or `JWT_SECRET`), so changing that secret means entering the mailbox password again |

- A save writes only the documents that changed, in one transaction. A failed save is retried until it goes through; meanwhile `GET /health` reports `"durable": false` and the error.
- On a deploy the old process receives SIGTERM and finishes its writes before exiting.
- First start on an empty `app_documents`: data is taken over from the older single-row table `app_state` if it exists, otherwise from `data/db.json`. The old table is left untouched.
- Without `DATABASE_URL` the server keeps data in `data/db.json`. That is for a developer machine only: on Render the disk is rebuilt on every deploy, so the server refuses to start there without a database (`ALLOW_EPHEMERAL_STORE=1` overrides this; do not set it in production).
- `npm run test:pg` runs the storage tests against a real Postgres (`TEST_DATABASE_URL`).
