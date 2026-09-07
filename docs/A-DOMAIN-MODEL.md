# A — Domain Model

The model the legacy workbooks are migrated into, and the reasoning behind its
shape.

The workbooks are four flat, disconnected tables. A customer who books a hotel,
a transfer and an excursion appears three times with no link between them. The
central design decision is to introduce an aggregate that ties those together —
without collapsing the modules, which the operations desk still works in
separately.

---

## The central aggregate

```
TripFile  EB-2026-000123
│
├── leadTraveler ─────────── Traveler
├── travelers[] ──────────── TripTraveler → Traveler
├── partner ──────────────── Partner            (travel agency)
│
├── hotelBookings[] ──────── HotelBooking
│                            └── staySegments[] ── HotelStaySegment
│                                                  └── roomAllocations[] ── RoomAllocation
│
├── transferBookings[] ───── TransferBooking
│                            └── legs[] ────────── TransferLeg
│
├── excursionBookings[] ──── ExcursionBooking
│                            └── items[] ───────── ExcursionItem
│
├── visaOrders[] ─────────── VisaOrder
│                            └── applicants[] ──── VisaApplicant
│
├── financialDocuments[] ─── FinancialDocument
│                            └── payments[] ────── PaymentTransaction
│
├── attachments[] ────────── Attachment
└── statusHistory[] ──────── StatusTransition
```

### Why every service is a two-level structure

Booking → child rows is not decoration. It is what the legacy sheets encode with
their blank-NAME continuation rows:

| Parent | Children | What the children are |
| --- | --- | --- |
| `HotelBooking` | `HotelStaySegment` | A guest who moves between hotels |
| `TransferBooking` | `TransferLeg` | Arrival, return, and any further journeys |
| `ExcursionBooking` | `ExcursionItem` | Several activities on one order |
| `VisaOrder` | `VisaApplicant` | Per-passenger documents |

Flattening any of these would turn one customer's return journey into a second
anonymous traveller — which is precisely the failure mode a naive row-by-row
import produces.

`RoomAllocation` sits under the stay rather than the booking because room type
and count belong to a particular stay: the same guest may have a double at one
hotel and a triple at the next.

`VisaApplicant` is the exception in practice — the legacy sheet recorded only an
aggregate PAX count, so imported orders have no applicant rows. The table exists
so per-passenger documents can be added later without invalidating the
aggregate.

---

## Identity and access

```
User ──< UserRole >── Role ──< RolePermission >── Permission
 │                                                    │
 └──< UserPermissionOverride >────────────────────────┘

User ──< Session
     ──< PasswordResetToken
     ──< ApiKey
```

Roles are **editable bundles of permissions**, not hard-coded names. Effective
permissions are the union of role permissions, plus per-user grants, minus
per-user revocations — recomputed from the database on every request so that
revoking access takes effect immediately.

`UserPermissionOverride` exists for the real case where one person needs an
exception without inventing a new role for them.

`Session` stores a hash of the refresh token, never the token. Presenting a
refresh token that does not match a live session revokes every session for that
user, on the assumption the token was replayed.

---

## Master data and the alias system

```
Partner   ──< PartnerAlias
Hotel     ──< HotelAlias
RoomType  ──< RoomTypeAlias
MealPlan  ──< MealPlanAlias
Location  ──< LocationAlias
ExcursionCatalogItem ──< ExcursionAlias
Nationality ──< NationalityAlias

AliasMapping   (the review queue, across every type)
```

Every master entity carries a canonical record plus alias rows. The source data
spells one agency ten ways (`elbakri`, `ELBAKRI`, `البكري اوفرسيز`,
`ELBAKRIOVER ESAS`, …), and the alias table is what lets those resolve
deterministically instead of by similarity.

`AliasMapping` holds values that did **not** resolve. Nothing in it has been
applied — each row is a decision waiting for a person, who can link it to an
existing record, promote it to a new one, or reject it. The decision is audited.

Every entity also has a `normalizedName` for matching, alongside the display
name. The two are separate on purpose: a traveller's real name is never
overwritten by its search form.

---

## Finance

```
Counterparty ──< FinancialDocument ──< PaymentTransaction
     │                                        │
     └──< Settlement ─────────────────────────┘
                │
             Partner
```

`Counterparty` is deliberately generic — a hotel, an agency, a supplier or a
driver are all counterparties. Nothing is special-cased.

`FinancialDocument` holds a total, a currency and dates. It does **not** hold a
paid amount or a balance: those are derived from `PaymentTransaction` on every
read, so a stored column can never disagree with the transactions beneath it.

`PaymentTransaction` is append-only in spirit. A correction posts a `REVERSAL`
row linked to the original, and the original is marked `REVERSED` with a reason.
Both stay visible.

`Settlement` covers periodic settlements with a partner. The `SAMA` worksheet
becomes settlement rows against a SAMA `Partner` record — nothing in the
structure is specific to SAMA, and the same path serves any other partner.

### Legacy columns on `FinancialDocument`

`legacyTotalRaw`, `legacyPaidRaw`, `legacyRestRaw`, `legacyPaymentDateRaw` and
`legacyStatusRaw` hold the workbook's figures exactly as typed, including
non-numeric text such as `credit` or `-`.

They are never used in a calculation. They exist so a finance user can see what
the spreadsheet said next to what the ledger computes — which matters, because
the two disagree on 10 of the 38 fully-numeric rows.

---

## Data governance

```
ImportRun ──< ImportSheet ──< ImportRow ──< ImportIssue
    │
    └──< DataQualityIssue

AuditLog        every material mutation
StatusTransition  every status change
Attachment      private storage, signed access
Notification    in-app alerts
SavedView       per-user list configurations
SystemSetting   runtime configuration
ReferenceSequence  collision-free reference numbers
```

`ImportRow` keeps every scanned row's raw values forever, so any imported record
can be traced back to exactly what the spreadsheet said — and any source row can
be traced forward to what it became.

`DataQualityIssue` carries a `fingerprint` (a hash over category, entity, field
and source row) so re-running analysis updates an existing issue rather than
duplicating it, and does not reopen one a person has already resolved.

`ReferenceSequence` allocates human-readable references (`EB-2026-000123`)
through a database counter, so two concurrent requests can never be handed the
same number.

---

## Provenance on business records

Every record created by an import carries:

```jsonc
// legacySource
{
  "workbook": "ELBAKRI OVER SEAS BOOKING .xlsx",
  "sheet": "Sheet1",
  "row": 122,
  "importRunId": "…",
  "rawValues": { "checkIn": "31 auguest", "…": "…" },
  "unmappedValues": { "Z": ";" }
}
```

plus an `importRunId` foreign key. The trip file screen shows this as *imported
from Sheet1 row 122*.

Individual fields that needed interpretation also keep their raw text next to
the parsed value:

| Field | Raw companion |
| --- | --- |
| `HotelStaySegment.checkIn` | `checkInRaw`, `checkInParseStatus` |
| `HotelStaySegment.checkOut` | `checkOutRaw`, `checkOutParseStatus` |
| `TransferLeg.pickupTimeMinutes` | `pickupTimeRaw`, `pickupTimeParseStatus` |
| `TransferLeg.serviceDate` | `serviceDateRaw` |
| `Traveler.phoneNormalized` | `phoneRaw`, `phoneDigits` |
| `ExcursionBooking` | `legacyRestRaw` |
| Any unresolved master value | `hotelRaw`, `mealPlanRaw`, `roomTypeRaw`, `fromRaw`, `toRaw`, `nationalityRaw` |

A record with an unreadable pickup time still imports, still appears on the
dispatch board, and shows the original text in warning colour — rather than
being dropped or silently given a plausible time.

---

## Status values

Stored as canonical strings. Translation happens only in the web app's
dictionaries.

| Entity | States |
| --- | --- |
| `TripFile` | DRAFT, REQUESTED, CONFIRMED, IN_PROGRESS, COMPLETED, ON_HOLD, CANCELLED |
| `HotelBooking` | DRAFT, REQUESTED, CONFIRMED, CHECKED_IN, CHECKED_OUT, NO_SHOW, CANCELLED |
| `TransferLeg` | DRAFT, SCHEDULED, ASSIGNED, DISPATCHED, PICKED_UP, COMPLETED, NO_SHOW, CANCELLED |
| `ExcursionItem` | DRAFT, REQUESTED, CONFIRMED, IN_PROGRESS, COMPLETED, NO_SHOW, CANCELLED |
| `VisaOrder` | DRAFT, DOCUMENTS_PENDING, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, CANCELLED, COMPLETED |
| `FinancialDocument` | DRAFT, OPEN, PARTIALLY_PAID, PAID, OVERPAID, CANCELLED |
| `PaymentTransaction` | POSTED, REVERSED, REVERSAL |

The database stores `CONFIRMED`; English reads *Confirmed* and Arabic reads
*مؤكد*. A translated label is never persisted — otherwise the same status would
be two different values depending on who entered it.

Service status is independent of trip status: a trip can be `CONFIRMED` while a
visa on it is still `DOCUMENTS_PENDING`.

---

## Soft deletion

Business entities carry `deletedAt` and are archived rather than removed:
`TripFile`, `Traveler`, `HotelBooking`, `TransferBooking`, `ExcursionBooking`,
`VisaOrder`, `FinancialDocument`, `Settlement`, `Partner`, `Hotel`,
`Counterparty`, `Attachment`, `User`.

Payments are never deleted at all — they are reversed. Audit entries and import
rows are immutable.

---

## Concurrency

Records edited by several people carry a `version` counter: `TripFile`,
`HotelBooking`, `TransferBooking`, `TransferLeg`, `ExcursionBooking`,
`ExcursionItem`, `VisaOrder`, `FinancialDocument`, `Settlement`.

A client that submits the version it read receives a `STALE_RECORD` conflict if
the record has changed since, rather than silently overwriting a colleague.

---

## Indexes

Indexed for the searches the operations desk actually runs: references,
normalised names, phone digits, service dates, check-in and check-out, flight
numbers, statuses, partner and hotel foreign keys, alias keys, audit entity
lookups, and the data-quality fingerprint.

Uniqueness is enforced where it matters: every reference, every
`normalizedName` on master data, `(aliasKey, entityId)` on alias tables,
`(importSheetId, rowNumber)` on import rows, and `fingerprint` on data-quality
issues.

---

## Where JSON is and is not used

JSON columns are limited to raw legacy snapshots (`legacySource`,
`rawValues`, `unmappedValues`, `normalizedValues`), audit before/after
snapshots, analysis and reconciliation reports, saved view configurations, and
system settings.

Every core business concept is a normalised relational column. There is no
"booking blob".
