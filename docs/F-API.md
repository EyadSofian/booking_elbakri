# F — API Reference

Versioned REST at `/api/v1`. Interactive documentation at
[`/api/docs`](https://elbakri-api-production.up.railway.app/api/docs).

**124 endpoints across 21 controllers.** The route tables below are generated
from the controller sources by `scripts/gen-api-docs.py`, so the permission
listed against each route is the one the code actually enforces — the document
cannot drift from the guard.

The API is the system of record. Every business rule, validation, permission
check and calculation happens here; a request made outside the web app is
treated identically to one made through it.

---

## Conventions

### Authentication

```http
Authorization: Bearer <access token>     # a signed-in user
Authorization: ApiKey <key>              # a scoped integration key
```

Access tokens last 15 minutes. Refresh tokens are opaque, stored hashed, and
rotated on every use. Presenting a refresh token that no longer matches a live
session revokes **every** session for that user, on the assumption it was
replayed.

Only `/auth/login` and `/auth/refresh` are public. `/auth/logout`, `/auth/me`
and `/auth/change-password` need a valid token but no particular permission —
they are things any signed-in person does for their own account.

#### Signing in

```bash
curl -X POST https://elbakri-api-production.up.railway.app/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@elbakri.local","password":"<password>"}'
```

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs…",
  "refreshToken": "d4a38f43-….REPDWdHqmt8…",
  "expiresIn": 900,
  "user": {
    "id": "069c6158-7205-48e9-a63f-05b1e1fc9e37",
    "email": "admin@elbakri.local",
    "fullName": "System Administrator",
    "locale": "en",
    "roles": ["SUPER_ADMIN"],
    "permissions": ["trips.read", "trips.create", "…48 in total"]
  }
}
```

`user.permissions` is the caller's **effective** set — role permissions, plus
per-user grants, minus per-user revocations. It is recomputed on every request
rather than baked into the token, so revoking access takes effect immediately
instead of when the token expires.

### Responses

A list returns data plus pagination:

```json
{
  "data": [ … ],
  "meta": { "page": 1, "pageSize": 25, "total": 214,
            "totalPages": 9, "hasNext": true, "hasPrevious": false }
}
```

A single record returns the object directly.

### Errors

Every failure uses the same envelope:

```json
{
  "error": {
    "code": "CHECKOUT_BEFORE_CHECKIN",
    "message": "Check-out date is earlier than check-in date.",
    "details": { "checkIn": "2025-08-31", "checkOut": "2025-08-03" },
    "requestId": "3f9a…"
  }
}
```

`code` is stable and machine-readable — the web app maps it to a localised
message rather than showing the English text, so an Arabic user never sees
English from the backend. `requestId` is echoed in the `X-Request-Id` header
and appears in the server logs, so a user can quote it in a bug report.

Internal exception details never reach the client.

| Code | Status | Meaning |
| --- | :---: | --- |
| `VALIDATION_FAILED` | 400 | Field-level detail in `details.fields` |
| `UNAUTHENTICATED` | 401 | Missing, invalid or expired token |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token unknown or expired |
| `REFRESH_TOKEN_REUSE_DETECTED` | 401 | Replay suspected; all sessions revoked |
| `FORBIDDEN` | 403 | Permission denied; `details.missing` lists which |
| `NOT_FOUND` | 404 | |
| `CONFLICT` | 409 | Unique constraint, or a workbook already imported |
| `STALE_RECORD` | 409 | Someone else saved first — reload and reapply |
| `INVALID_STATUS_TRANSITION` | 409 | `details.allowed` lists valid targets |
| `CHECKOUT_BEFORE_CHECKIN` | 400 | |
| `BOOKING_DATE_AFTER_CHECKIN` | 400 | |
| `PAYMENT_EXCEEDS_DOCUMENT` | 409 | `details.outstanding` |
| `PAYMENT_ALREADY_REVERSED` | 409 | |
| `DUPLICATE_IMPORT` | 409 | Same SHA-256 already applied |
| `IMPORT_NOT_READY` / `IMPORT_ALREADY_APPLIED` | 409 | |
| `LAST_SUPER_ADMIN` | 409 | Cannot remove the final administrator |
| `CANNOT_MODIFY_OWN_ACCESS` | 403 | |
| `RATE_LIMITED` | 429 | |
| `INTERNAL_ERROR` | 500 | |

### Query parameters

Lists accept `page`, `pageSize` (max 200), `q`, `sortBy`, `sortDir`, and
resource-specific filters. Sorting is restricted to an allow-list per resource,
so a query string cannot order by an arbitrary column.

Paging, filtering and sorting are **server-side**. No endpoint returns an
unbounded collection.

### Dates

Service dates are stored and returned as UTC midnight (`2025-07-22T00:00:00.000Z`)
because they are calendar dates, not instants — a booking must not shift a day
for a reader in another timezone. Timestamps such as `createdAt` are true
instants.

Where a legacy value could not be parsed, the record carries both: `checkIn`
is `null` and `checkInRaw` holds what the workbook said (`"31 auguest"`), with
`checkInParseStatus` explaining why. Clients should show the raw value rather
than an empty cell.

### Concurrency

Mutable records carry a `version`. Send the version you read on an update; if
the record changed in the meantime the API returns `STALE_RECORD` rather than
overwriting a colleague's edit.

### Rate limiting

300 requests per minute by default; 10 per minute on sign-in. Exceeding either
returns `RATE_LIMITED`.

---

## Endpoints

### Health

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | *public* | Liveness probe |
| GET | `/api/health/ready` | *public* | Readiness probe — verifies the database is reachable |

### Authentication

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | *public* | Sign in and receive an access + refresh token pair |
| POST | `/api/v1/auth/refresh` | *public* | Exchange a refresh token for a new token pair |
| POST | `/api/v1/auth/logout` | *signed in* | End the current session |
| GET | `/api/v1/auth/me` | *signed in* | The signed-in user and their effective permissions |
| POST | `/api/v1/auth/change-password` | *signed in* | Change your own password; signs out every other device |

### Dashboard

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/dashboard/summary` | `trips.read` | Operational counters for a given day |
| GET | `/api/v1/dashboard/alerts` | `trips.read` | Things that need action before they become problems |
| GET | `/api/v1/dashboard/activity` | `trips.read` | Recent changes made by colleagues |
| GET | `/api/v1/dashboard/hotel-arrivals` | `hotels.read` | Hotel check-ins for a given day |
| GET | `/api/v1/dashboard/upcoming-transfers` | `transfers.read` | Transfers due in the next N days |

### Operations

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/operations/today` | `trips.read` | The chronological operational feed for one day |

### Global search

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/search` | `trips.read` | Global search across every major entity, permission filtered |

### Trip files

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/trips` | `trips.read` | List trip files |
| GET | `/api/v1/trips/:id` | `trips.read` | One trip file with every service and its timeline |
| POST | `/api/v1/trips` | `trips.create` | Create a trip file |
| PATCH | `/api/v1/trips/:id` | `trips.update` | Update a trip file |
| POST | `/api/v1/trips/:id/status` | `trips.update` | Move a trip file to another status |
| DELETE | `/api/v1/trips/:id` | `trips.cancel` | Archive a trip file (it is never hard deleted) |

### Travellers

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/travelers` | `travelers.read` |  |
| GET | `/api/v1/travelers/:id` | `travelers.read` |  |
| GET | `/api/v1/travelers/:id/duplicates` | `travelers.read` | Records that might be the same person. Suggestions only. |
| POST | `/api/v1/travelers` | `travelers.create` |  |
| PATCH | `/api/v1/travelers/:id` | `travelers.update` |  |
| POST | `/api/v1/travelers/:id/merge` | `travelers.merge` | Merge a duplicate into this traveller. Audited and reversible. |

### Hotel bookings

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/hotel-bookings` | `hotels.read` | List hotel bookings |
| GET | `/api/v1/hotel-bookings/:id` | `hotels.read` |  |
| POST | `/api/v1/hotel-bookings` | `hotels.create` | Create a booking with one or more stay segments |
| PATCH | `/api/v1/hotel-bookings/:id` | `hotels.update` |  |
| POST | `/api/v1/hotel-bookings/:id/segments` | `hotels.update` | Add another stay to an existing booking |
| PATCH | `/api/v1/hotel-bookings/segments/:segmentId` | `hotels.update` |  |
| POST | `/api/v1/hotel-bookings/:id/status` | `hotels.update` |  |

### Transfers

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/transfers` | `transfers.read` | List transfer bookings |
| GET | `/api/v1/transfers/legs` | `transfers.read` | List transfer legs — powers the list and dispatch board |
| GET | `/api/v1/transfers/:id` | `transfers.read` |  |
| POST | `/api/v1/transfers` | `transfers.create` |  |
| PATCH | `/api/v1/transfers/:id` | `transfers.update` |  |
| POST | `/api/v1/transfers/:id/legs` | `transfers.update` | Add a leg (return journey, extra transfer) to a booking |
| PATCH | `/api/v1/transfers/legs/:legId` | `transfers.update` |  |
| POST | `/api/v1/transfers/legs/:legId/assign` | `transfers.assign` | Assign a driver and vehicle to a leg |
| POST | `/api/v1/transfers/legs/:legId/status` | `transfers.status.update` | Move a leg through the dispatch workflow |

### Excursions

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/excursion-bookings` | `excursions.read` | List excursion orders |
| GET | `/api/v1/excursion-bookings/daily-board` | `excursions.read` | Every activity running on one day |
| GET | `/api/v1/excursion-bookings/:id` | `excursions.read` |  |
| POST | `/api/v1/excursion-bookings` | `excursions.create` | Create an order with one or more activities |
| PATCH | `/api/v1/excursion-bookings/:id` | `excursions.update` |  |
| POST | `/api/v1/excursion-bookings/:id/items` | `excursions.update` | Add another activity to an order |
| PATCH | `/api/v1/excursion-bookings/items/:itemId` | `excursions.update` |  |
| POST | `/api/v1/excursion-bookings/items/:itemId/status` | `excursions.update` |  |

### Visas

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/visa-orders` | `visas.read` | List visa orders. Amounts are hidden without visas.finance.read. |
| GET | `/api/v1/visa-orders/:id` | `visas.read` |  |
| POST | `/api/v1/visa-orders` | `visas.create` |  |
| PATCH | `/api/v1/visa-orders/:id` | `visas.update` |  |
| POST | `/api/v1/visa-orders/:id/status` | `visas.update` |  |
| POST | `/api/v1/visa-orders/:id/applicants` | `visas.update` | Add an applicant to an order |
| PATCH | `/api/v1/visa-orders/applicants/:applicantId` | `visas.update` |  |

### Finance

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/finance/overview` | `finance.read` | Finance headline figures, all derived from the ledger |
| GET | `/api/v1/finance/reconciliation` | `finance.reconcile` | Imported rows where the legacy REST disagrees with the ledger |
| GET | `/api/v1/financial-documents` | `finance.read` | List payables and receivables |
| GET | `/api/v1/financial-documents/:id` | `finance.read` | A document with its payment history and legacy reconciliation |
| POST | `/api/v1/financial-documents` | `finance.documents.manage` |  |
| PATCH | `/api/v1/financial-documents/:id` | `finance.documents.manage` |  |
| POST | `/api/v1/financial-documents/:id/payments` | `finance.payments.create` | Record a payment. The balance is recalculated, never typed. |
| GET | `/api/v1/payments` | `finance.read` |  |
| POST | `/api/v1/payments/:id/reverse` | `finance.payments.reverse` | Reverse a payment. The original entry is kept, not deleted. |
| GET | `/api/v1/settlements` | `finance.read` |  |
| GET | `/api/v1/partners/:id/ledger` | `finance.read` | Running balance with one partner |

### Master data

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/partners` | `master_data.read` |  |
| POST | `/api/v1/partners` | `master_data.manage` |  |
| GET | `/api/v1/hotels` | `master_data.read` |  |
| POST | `/api/v1/hotels` | `master_data.manage` |  |
| GET | `/api/v1/room-types` | `master_data.read` |  |
| GET | `/api/v1/meal-plans` | `master_data.read` |  |
| GET | `/api/v1/locations` | `master_data.read` |  |
| GET | `/api/v1/excursions` | `master_data.read` |  |
| GET | `/api/v1/nationalities` | `master_data.read` |  |
| GET | `/api/v1/drivers` | `master_data.read` |  |
| POST | `/api/v1/drivers` | `master_data.manage` |  |
| GET | `/api/v1/vehicles` | `master_data.read` |  |
| POST | `/api/v1/vehicles` | `master_data.manage` |  |
| GET | `/api/v1/alias-suggestions` | `master_data.read` | Legacy values that need a person to decide what they mean |
| POST | `/api/v1/alias-suggestions/:id/approve` | `master_data.manage` | Link an unresolved value to an existing master record |
| POST | `/api/v1/alias-suggestions/:id/promote` | `master_data.manage` | Create a new master record from an unresolved value |
| POST | `/api/v1/alias-suggestions/:id/reject` | `master_data.manage` |  |
| POST | `/api/v1/aliases` | `master_data.manage` | Add an alias to a master record by hand |

### Imports

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/imports` | `imports.review` | List import runs |
| POST | `/api/v1/imports/analyze` | `imports.upload` | Upload a workbook and analyse it. Nothing is written to business tables. |
| GET | `/api/v1/imports/:id` | `imports.review` | An import run with its detected sheets |
| GET | `/api/v1/imports/:id/issues` | `imports.review` | Parse and mapping issues found during analysis |
| GET | `/api/v1/imports/:id/preview` | `imports.review` | What the apply stage would create, without writing it |
| GET | `/api/v1/imports/:id/reconciliation` | `imports.review` | Proof that every meaningful source row is accounted for |
| POST | `/api/v1/imports/:id/apply` | `imports.apply` | Write the analysed workbook into the system, in one transaction |

### Data quality

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/data-quality` | `data_quality.read` | List data quality issues |
| GET | `/api/v1/data-quality/summary` | `data_quality.read` | Issue counts by status, category and severity |
| GET | `/api/v1/data-quality/:id` | `data_quality.read` |  |
| POST | `/api/v1/data-quality/:id/assign` | `data_quality.resolve` | Assign an issue to a colleague |
| POST | `/api/v1/data-quality/:id/resolve` | `data_quality.resolve` | Resolve an issue, or ignore it with a stated reason |
| POST | `/api/v1/data-quality/:id/reopen` | `data_quality.resolve` | Reopen a closed issue |

### Reports

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/reports` | `reports.export` | The reports that can be exported |
| GET | `/api/v1/reports/:key.xlsx` | `reports.export` | Download a filtered report as an Excel workbook |

### Notifications

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/notifications` | `notifications.read` |  |
| GET | `/api/v1/notifications/unread-count` | `notifications.read` |  |
| POST | `/api/v1/notifications/mark-read` | `notifications.read` |  |
| POST | `/api/v1/notifications/mark-all-read` | `notifications.read` |  |

### Users & roles

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/users` | `users.read` |  |
| GET | `/api/v1/users/:id` | `users.read` |  |
| POST | `/api/v1/users` | `users.create` |  |
| PATCH | `/api/v1/users/:id` | `users.manage` |  |
| POST | `/api/v1/users/:id/roles` | `users.manage` | Replace a user\ |
| POST | `/api/v1/users/:id/permission-override` | `users.manage` | Grant or revoke one permission for a user. Pass granted=null to clear. |
| POST | `/api/v1/users/:id/reset-password` | `users.manage` |  |
| POST | `/api/v1/users/:id/revoke-sessions` | `users.manage` |  |
| GET | `/api/v1/roles` | `users.read` |  |
| GET | `/api/v1/permissions` | `users.read` |  |
| POST | `/api/v1/roles/:id/permissions` | `roles.manage` | Set the permissions a role grants |

### Audit log

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/audit` | `audit.read` | The global audit log |
| GET | `/api/v1/audit/entity` | `audit.read` | The change history of one record |

### API keys

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/api-keys` | `api_keys.manage` |  |
| GET | `/api/v1/api-keys/scopes` | `api_keys.create` | The read-only scopes a key can be granted |
| POST | `/api/v1/api-keys` | `api_keys.create` | Issue a key. The secret is shown once and never stored. |
| DELETE | `/api/v1/api-keys/:id` | `api_keys.manage` |  |

### Settings

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/settings` | `settings.manage` |  |
| PUT | `/api/v1/settings/:key` | `settings.manage` |  |
---

## Worked examples

### Recording a payment

There is no endpoint that sets a paid total or a balance — that is the point.
You record a transaction, and the balance follows from the ledger.

```bash
curl -X POST "$API/api/v1/financial-documents/$DOC_ID/payments" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"amount": 9700, "currency": "EGP", "paymentDate": "2025-08-14",
       "method": "BANK_TRANSFER", "paymentReference": "TRF-2231"}'
```

Reading the document back shows `paidAmount` and `outstanding` recomputed, and
`status` re-derived. Correcting a mistake posts a reversal rather than editing
history:

```bash
curl -X POST "$API/api/v1/payments/$PAYMENT_ID/reverse" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason": "Paid against the wrong hotel"}'
```

The original is marked `REVERSED`, a matching `REVERSAL` entry is written, and
both stay visible.

### Importing a workbook

```bash
# 1. Analyse — writes nothing to business tables
curl -X POST "$API/api/v1/imports/analyze" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@'ELBAKRI OVER SEAS BOOKING .xlsx'"
# -> { "importRunId": "…", "status": "ANALYZED" }

# 2. Read the reconciliation before committing to anything
curl "$API/api/v1/imports/$RUN_ID/reconciliation" -H "Authorization: Bearer $TOKEN"

# 3. Apply — the whole workbook in one transaction
curl -X POST "$API/api/v1/imports/$RUN_ID/apply" -H "Authorization: Bearer $TOKEN"
# -> { "recordsCreated": 426, "recordsMatched": 2, "issuesRaised": 432 }
```

Re-applying a workbook already applied returns `CONFLICT`, matched by SHA-256 —
renaming the file does not defeat it.

The reconciliation is the acceptance criterion:

```
rowsScanned = blank + structural + master + continuation + unresolved
```

checked per sheet and for the workbook. For the four supplied files this
balances on all seven sheets — 4,013 rows scanned, all accounted for.

### Permission-filtered responses

Two endpoints omit data rather than merely hiding it in the UI:

- **Visa amounts.** `netAmount`, `sellAmount` and the derived `margin` are
  absent from the response for callers without `visas.finance.read`. Writes to
  those fields are ignored for the same callers.
- **Global search.** `/search` filters results by the caller's permissions, so
  the command palette cannot surface a record the user may not open.

`margin` is always computed as `sell − net` on read and is never stored, so it
cannot drift from the amounts it comes from.

---

## API keys

For integrations — a website, a chatbot, an accounting bridge.

```http
Authorization: ApiKey eb_live_…
```

Scopes are **read-only by construction**: `trips:read`, `operations:read`,
`hotels:read`, `transfers:read`, `excursions:read`, `visas:read`. Each maps to
a set of read permissions, and `finance.read` and `visas.finance.read` are
stripped afterwards — so no combination of scopes exposes financial or
administrative data, whatever is requested.

A key only reaches endpoints marked *API key allowed* in the tables above. The
plaintext is shown once; only its Argon2 hash is stored, so a database leak
cannot be turned into working credentials.

---

## Regenerating this document

```bash
python3 scripts/gen-api-docs.py
```

Prints the route count and flags any route with no permission guard and no
`@Public()`. Three are expected: `/auth/logout`, `/auth/me` and
`/auth/change-password`. Anything else in that list is a route that was added
without deciding who may call it.
