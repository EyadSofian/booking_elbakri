# F — API

Versioned REST at `/api/v1`. Interactive documentation at `/api/docs` when
`SWAGGER_ENABLED=true`.

The API is the system of record. Every business rule, validation, permission
check and calculation happens here; a request made outside the web app is
treated identically to one made through it.

---

## Conventions

### Authentication

```
Authorization: Bearer <access token>     # a signed-in user
Authorization: ApiKey <key>              # a scoped integration key
```

Access tokens last 15 minutes. Refresh tokens are opaque, stored hashed, and
rotated on every use.

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
message rather than showing the English text. `requestId` is echoed in the
`X-Request-Id` header and appears in the server logs, so a user can quote it.

Internal exception details never reach the client.

| Code | Status | Meaning |
| --- | :---: | --- |
| `VALIDATION_FAILED` | 400 | Field-level details in `details.fields` |
| `UNAUTHENTICATED` | 401 | Missing, invalid or expired token |
| `FORBIDDEN` | 403 | Permission denied; `details.missing` lists which |
| `NOT_FOUND` | 404 | |
| `CONFLICT` | 409 | Unique constraint or duplicate import |
| `STALE_RECORD` | 409 | Someone else saved first |
| `INVALID_STATUS_TRANSITION` | 409 | `details.allowed` lists valid targets |
| `CHECKOUT_BEFORE_CHECKIN` | 400 | |
| `PAYMENT_EXCEEDS_DOCUMENT` | 409 | `details.outstanding` |
| `PAYMENT_ALREADY_REVERSED` | 409 | |
| `LAST_SUPER_ADMIN` | 409 | |
| `CANNOT_MODIFY_OWN_ACCESS` | 403 | |
| `RATE_LIMITED` | 429 | |
| `INTERNAL_ERROR` | 500 | |

### Query parameters

Lists accept `page`, `pageSize` (max 200), `q`, `sortBy`, `sortDir` and
`status` (comma-separated). Sorting is restricted to an allow-list per resource,
so a query string cannot order by an arbitrary column.

Paging, filtering and sorting are **server-side**. No endpoint returns an
unbounded collection.

### Concurrency

Mutable records carry a `version`. Send the version you read on an update; a
mismatch returns `STALE_RECORD` rather than overwriting a colleague's change.

---

## Endpoints

### Auth — `/auth`

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | public | Rate limited to 10/min |
| POST | `/auth/refresh` | public | Rotates the refresh token |
| POST | `/auth/logout` | authenticated | Ends this session |
| GET | `/auth/me` | authenticated | User and effective permissions |
| POST | `/auth/change-password` | authenticated | Revokes every other session |

### Dashboard and operations

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/dashboard/summary` | `trips.read` |
| GET | `/dashboard/alerts` | `trips.read` |
| GET | `/dashboard/activity` | `trips.read` |
| GET | `/dashboard/hotel-arrivals` | `hotels.read` |
| GET | `/dashboard/upcoming-transfers` | `transfers.read` |
| GET | `/operations/today` | `trips.read` |

`/operations/today?date=YYYY-MM-DD` returns the chronological feed across every
service type for one day.

### Trip files — `/trips`

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/trips` | `trips.read` |
| GET | `/trips/:id` | `trips.read` |
| POST | `/trips` | `trips.create` |
| PATCH | `/trips/:id` | `trips.update` |
| POST | `/trips/:id/status` | `trips.update` |
| DELETE | `/trips/:id` | `trips.cancel` |

`GET /trips/:id` returns the file with every service and a **derived timeline**
built from the actual child services, not a stored copy.

`DELETE` archives; it never hard deletes.

Search covers reference, traveller name, phone, agency, hotel and flight number.

### Travellers — `/travelers`

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/travelers` | `travelers.read` |
| GET | `/travelers/:id` | `travelers.read` |
| GET | `/travelers/:id/duplicates` | `travelers.read` |
| POST | `/travelers` | `travelers.create` |
| PATCH | `/travelers/:id` | `travelers.update` |
| POST | `/travelers/:id/merge` | `travelers.merge` |

`/duplicates` returns scored candidates with the evidence behind each score.
It only ever suggests — merging is an explicit, audited action.

### Hotel bookings — `/hotel-bookings`

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/hotel-bookings` | `hotels.read` |
| GET | `/hotel-bookings/:id` | `hotels.read` |
| POST | `/hotel-bookings` | `hotels.create` |
| PATCH | `/hotel-bookings/:id` | `hotels.update` |
| POST | `/hotel-bookings/:id/segments` | `hotels.update` |
| PATCH | `/hotel-bookings/segments/:segmentId` | `hotels.update` |
| POST | `/hotel-bookings/:id/status` | `hotels.update` |

A booking is created with one or more stay segments, each with its own rooms.
`nights` is always derived; supplying it has no effect.

### Transfers — `/transfers`

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/transfers` | `transfers.read` |
| GET | `/transfers/legs` | `transfers.read` |
| GET | `/transfers/:id` | `transfers.read` |
| POST | `/transfers` | `transfers.create` |
| PATCH | `/transfers/:id` | `transfers.update` |
| POST | `/transfers/:id/legs` | `transfers.update` |
| PATCH | `/transfers/legs/:legId` | `transfers.update` |
| POST | `/transfers/legs/:legId/assign` | `transfers.assign` |
| POST | `/transfers/legs/:legId/status` | `transfers.status.update` |

`/transfers/legs` powers both the list and the dispatch board. It accepts
`unassignedOnly` and `missingPickupOnly`, which are the two questions a
dispatcher actually asks.

### Excursions — `/excursion-bookings`

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/excursion-bookings` | `excursions.read` |
| GET | `/excursion-bookings/daily-board` | `excursions.read` |
| GET | `/excursion-bookings/:id` | `excursions.read` |
| POST | `/excursion-bookings` | `excursions.create` |
| PATCH | `/excursion-bookings/:id` | `excursions.update` |
| POST | `/excursion-bookings/:id/items` | `excursions.update` |
| PATCH | `/excursion-bookings/items/:itemId` | `excursions.update` |
| POST | `/excursion-bookings/items/:itemId/status` | `excursions.update` |

### Visas — `/visa-orders`

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/visa-orders` | `visas.read` |
| GET | `/visa-orders/:id` | `visas.read` |
| POST | `/visa-orders` | `visas.create` |
| PATCH | `/visa-orders/:id` | `visas.update` |
| POST | `/visa-orders/:id/status` | `visas.update` |
| POST | `/visa-orders/:id/applicants` | `visas.update` |
| PATCH | `/visa-orders/applicants/:applicantId` | `visas.update` |

`netAmount`, `sellAmount` and the derived `margin` are **omitted from the
response** without `visas.finance.read` — not merely hidden by the UI. Writes to
those fields are ignored for the same users.

### Finance

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/finance/overview` | `finance.read` |
| GET | `/finance/reconciliation` | `finance.reconcile` |
| GET | `/financial-documents` | `finance.read` |
| GET | `/financial-documents/:id` | `finance.read` |
| POST | `/financial-documents` | `finance.documents.manage` |
| PATCH | `/financial-documents/:id` | `finance.documents.manage` |
| POST | `/financial-documents/:id/payments` | `finance.payments.create` |
| GET | `/payments` | `finance.read` |
| POST | `/payments/:id/reverse` | `finance.payments.reverse` |
| GET | `/settlements` | `finance.read` |
| GET | `/partners/:id/ledger` | `finance.read` |

`paidAmount` and `outstanding` are computed from the ledger on every read.
**There is no endpoint that sets them** — that is the point.

Reversal requires a reason and posts a new entry rather than editing history.

`GET /financial-documents/:id` includes `legacyReconciliation` for imported
rows: the workbook's figures next to the calculated balance and the difference.

### Master data

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/partners`, `/hotels`, `/room-types`, `/meal-plans`, `/locations`, `/excursions`, `/nationalities`, `/drivers`, `/vehicles` | `master_data.read` |
| POST | `/partners`, `/hotels`, `/drivers`, `/vehicles` | `master_data.manage` |
| GET | `/alias-suggestions` | `master_data.read` |
| POST | `/alias-suggestions/:id/approve` | `master_data.manage` |
| POST | `/alias-suggestions/:id/promote` | `master_data.manage` |
| POST | `/alias-suggestions/:id/reject` | `master_data.manage` |
| POST | `/aliases` | `master_data.manage` |

`approve` links an unresolved value to an existing record; `promote` creates a
new record from it. Both are audited.

### Imports — `/imports`

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/imports` | `imports.review` |
| POST | `/imports/analyze` | `imports.upload` |
| GET | `/imports/:id` | `imports.review` |
| GET | `/imports/:id/issues` | `imports.review` |
| GET | `/imports/:id/preview` | `imports.review` |
| GET | `/imports/:id/reconciliation` | `imports.review` |
| POST | `/imports/:id/apply` | `imports.apply` |

`analyze` takes `multipart/form-data` with a `file` field and **writes nothing**
to business tables. `apply` writes the whole workbook in one transaction.

Re-applying a workbook already applied returns `CONFLICT` — matched by SHA-256,
so renaming the file does not defeat it.

### Data quality — `/data-quality`

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/data-quality` | `data_quality.read` |
| GET | `/data-quality/summary` | `data_quality.read` |
| GET | `/data-quality/:id` | `data_quality.read` |
| POST | `/data-quality/:id/assign` | `data_quality.resolve` |
| POST | `/data-quality/:id/resolve` | `data_quality.resolve` |
| POST | `/data-quality/:id/reopen` | `data_quality.resolve` |

`resolve` takes `status` of `RESOLVED` or `IGNORED_WITH_REASON`; the latter
**requires** notes.

### Reports — `/reports`

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/reports` | `reports.export` |
| GET | `/reports/:key.xlsx` | `reports.export` |

Keys: `hotel-bookings`, `transfers`, `excursions`, `visas`, `payables`,
`payments`, `outstanding`, `todays-operations`, `agency`, `hotel`.

`legacyLayout=true` reproduces the original spreadsheet columns exactly, so the
file can sit alongside the old ones during the transition.

### Search — `/search`

`GET /search?q=…` searches trips, travellers, hotel bookings, transfers,
excursions, visas, hotels, partners and payables. Results are **filtered by the
caller's permissions**, so the palette cannot reveal records the user may not
open.

### Administration

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/users`, `/users/:id` | `users.read` |
| POST | `/users` | `users.create` |
| PATCH | `/users/:id` | `users.manage` |
| POST | `/users/:id/roles` | `users.manage` |
| POST | `/users/:id/permission-override` | `users.manage` |
| POST | `/users/:id/reset-password` | `users.manage` |
| POST | `/users/:id/revoke-sessions` | `users.manage` |
| GET | `/roles`, `/permissions` | `users.read` |
| POST | `/roles/:id/permissions` | `roles.manage` |
| GET | `/audit`, `/audit/entity` | `audit.read` |
| GET/POST/DELETE | `/api-keys` | `api_keys.*` |
| GET/PUT | `/settings` | `settings.manage` |

### Health

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | Liveness. Public, version-neutral |
| GET | `/api/health/ready` | Readiness; verifies the database |

Version-neutral so a load balancer's probe need not track the API version.

---

## Rate limiting

300 requests per minute by default; 10 per minute on sign-in. Exceeding either
returns `RATE_LIMITED`.

## Security headers

Helmet sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and
HSTS. CORS is restricted to `CORS_ORIGINS`.
