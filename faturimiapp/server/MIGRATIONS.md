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

## Backup and restore

`GET /api/sync/backup` returns `{ version, exportedAt, userId, checksum, data }`.

`POST /api/sync/backup/restore` replaces **only that user’s** invoices, obligations, clients, and profile.

- Body must include `confirm: "RESTORE"`.
- If `checksum` is sent, it must match `sha256(JSON.stringify(data))`.
- Do not run restore against production data without an explicit operator request.
