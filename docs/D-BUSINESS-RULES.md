# D — Business Rules

Every rule below is enforced on the server. The web app mirrors some of them to
give immediate feedback, but no rule depends on the client for correctness: an
API call that bypasses the UI is checked exactly the same way.

Pure rules live in `packages/shared/src/rules/` so they can be unit tested
without a database, and are applied by the service layer in `apps/api`.

---

## 1. Hotel stays

**Source:** `packages/shared/src/rules/hotel.ts`

| Rule | Behaviour |
| --- | --- |
| `checkOut > checkIn` | Rejected for new bookings (`CHECKOUT_BEFORE_CHECKIN`) |
| Same-day stay | Allowed, warned as `ZERO_NIGHT_STAY` |
| `nights` | Always derived as `checkOut − checkIn`; never accepted from a client |
| Booking date after check-in | Warning `BOOKING_DATE_AFTER_CHECKIN`, not a rejection |
| Year outside 2015–2035 | Warning `SUSPICIOUS_YEAR` |

### New bookings vs historical imports

These take deliberately different paths.

A booking **entered through the API** with a reversed date range is rejected —
letting it through would put a stay in the system that cannot be operated.

A booking **imported from a legacy workbook** keeps its original dates and
raises a `DATE_ERROR` issue instead. The supplied files contain five such rows
(e.g. `Sheet1` row 122: check-in 31 Aug 2025, check-out 3 Aug 2025). Rejecting
them would drop real history; silently "correcting" them would invent a fact
nobody recorded. The stay is imported as it was written, `nights` is left null,
and the row appears in Data Quality for someone who can check what actually
happened.

### Multiple stays per booking

One `HotelBooking` holds one or more `HotelStaySegment` rows. A guest who moves
between hotels is one booking, not two — which is also what the legacy sheet's
blank-NAME continuation rows meant.

---

## 2. Transfers

**Source:** `packages/shared/src/rules/state-machines.ts`

```
DRAFT ─→ SCHEDULED ─→ ASSIGNED ─→ DISPATCHED ─→ PICKED_UP ─→ COMPLETED
  │          │            │            │             │
  └──────────┴────────────┴────────────┴─────────────┴──→ CANCELLED / NO_SHOW
```

| Rule | Behaviour |
| --- | --- |
| Transition must be in the map | Otherwise `INVALID_STATUS_TRANSITION` with the allowed set |
| `DISPATCHED` requires a driver | Rejected without one |
| `COMPLETED` / `CANCELLED` are terminal | No transition out |
| A dispatched leg cannot return to `DRAFT` | Not in the map |
| Every leg needs a service date | Required by the API |

A leg that has been handed to a driver cannot be rewound to a draft. Once
something has happened on the ground, the record of it has to stay truthful,
and an "undo" that erases a dispatch would make the operational history a
guess.

Assigning a driver moves `SCHEDULED → ASSIGNED` automatically; clearing the
driver moves it back.

### Pickup times

Legacy imports may produce a leg with no usable pickup time. Such a leg is
imported with `pickupTimeMinutes` null and `pickupTimeRaw` intact, appears in
warning colour in the UI, and is listed on the dashboard under *transfers
without a pickup time*. It is a real leg that needs a decision, not an error to
be hidden.

---

## 3. Excursions

One `ExcursionBooking` holds one or more `ExcursionItem` rows. An order needs at
least one activity, and each activity needs either a catalogue item or a
description.

```
DRAFT → REQUESTED → CONFIRMED → IN_PROGRESS → COMPLETED
                        └──────────────────→ NO_SHOW / CANCELLED
```

### The legacy REST column

Its business meaning is not established by the source material, so **no meaning
is assigned**. The value is stored verbatim in `legacyRestRaw`, displayed with a
note saying it is unmapped, exported unchanged, and flagged for review when it
holds anything other than a plain `NO`. An administrator can define and migrate
it later. See `docs/B-LEGACY-EXCEL-MAPPING.md`.

---

## 4. Visas

```
DRAFT → DOCUMENTS_PENDING → SUBMITTED → UNDER_REVIEW → APPROVED → COMPLETED
                                             └──────→ REJECTED → DOCUMENTS_PENDING
```

### Margin

```
margin = sellAmount − netAmount
```

Derived on every read; **never stored**. A stored margin is a second copy of a
number that already exists twice, and it drifts the first time someone edits
`sell` without recalculating. The API rejects any attempt to write it.

Both amounts and the derived margin are omitted entirely from API responses for
users without `visas.finance.read` — hidden at the source, not just in the UI.

### Applicants

`VisaApplicant` carries per-passenger documents. The legacy sheet recorded only
an aggregate PAX count, so imported orders have no applicant rows; adding them
later must not invalidate the aggregate, so `paxCount` stays authoritative until
applicants exist.

---

## 5. Finance

**Source:** `packages/shared/src/rules/finance.ts`

This is the area where the legacy workbook is least trustworthy, so it is the
area with the strictest rule.

```
paid        = Σ(payments where status = POSTED)
outstanding = totalAmount − paid
```

| Rule | Behaviour |
| --- | --- |
| `paid` and `outstanding` are derived | Computed on every read; no stored column |
| Users record payments | There is no field to type a "paid" or "rest" total |
| Payment amount must be > 0 | Rejected otherwise |
| Payment cannot exceed the balance | `PAYMENT_EXCEEDS_DOCUMENT` unless explicitly overridden |
| Only a `POSTED` payment can be reversed | `PAYMENT_ALREADY_REVERSED` otherwise |
| A reversal requires a reason | Rejected without one |
| Document status is derived | `OPEN` / `PARTIALLY_PAID` / `PAID` / `OVERPAID` from the ledger |

### Why there is no editable "paid" field

The source workbook's `REST` column disagrees with its own arithmetic on 10 of
the 38 rows where all three figures are numeric — used as a remainder on some
rows and a running total on others. Any system that lets a person type a balance
inherits that class of error.

So the balance is not a field. It is the result of the transactions, and it
cannot disagree with them.

### Reversals, not deletions

Correcting a payment posts a **new** transaction:

1. the original is marked `REVERSED` with a reason and a timestamp;
2. a matching negative `REVERSAL` entry is written, linked to the original;
3. the document status is re-derived from what is still `POSTED`.

Both entries stay visible. The history shows the mistake and the correction —
deleting the row would leave a balance that changed for no recorded reason.

### Legacy reconciliation

Every imported payable keeps `legacyTotalRaw`, `legacyPaidRaw`, `legacyRestRaw`,
`legacyPaymentDateRaw` and `legacyStatusRaw` exactly as the workbook had them.
Where the legacy REST disagrees with the ledger balance, a
`FINANCIAL_RECONCILIATION_MISMATCH` issue is raised and both figures are shown
side by side in Finance → Reconciliation.

The reconciliation also recognises the specific pattern where REST equals
`total + paid` rather than the remainder, and says so — that is more useful to a
finance user than a bare "does not match".

**The historical figures are never modified.** They are evidence.

---

## 6. Trip files

```
DRAFT → REQUESTED → CONFIRMED → IN_PROGRESS → COMPLETED
   └────────┴───────────┴────────────┴──────→ ON_HOLD / CANCELLED
```

Service status is independent of trip status: a trip can be `CONFIRMED` while a
visa on it is still `DOCUMENTS_PENDING`. Rolling one up into the other would
lose the distinction the operations desk actually works with.

### Travel dates

Derived from the earliest and latest date across the trip's hotel stays,
transfer legs, excursion items and visa orders.

Setting either date by hand sets `travelDatesOverridden`, after which the
derivation stops for that trip. Someone who corrects a date should not have it
silently overwritten the next time a service changes.

---

## 7. Travellers and duplicates

**Source:** `packages/shared/src/rules/matching.ts`

Evidence is weighted: exact normalised name 0.45, identical E.164 phone 0.40,
name similarity ≥ 0.85 0.30, phone suffix match 0.25, same nationality 0.10,
same agency 0.10.

| Confidence | Condition | Effect |
| --- | --- | --- |
| `EXACT` | Exact name **and** identical phone | Auto-linked |
| `HIGH_CONFIDENCE` | Score ≥ 0.70 | Suggested for review |
| `POSSIBLE` | Score ≥ 0.45 | Suggested for review |
| `NO_MATCH` | Below that | Ignored |

**A name alone never links two people.** Auto-linking requires the exact
normalised name *and* an identical phone number, and even then only when exactly
one candidate qualifies — two equally exact matches go to a human.

Anything weaker creates a separate traveller and raises a `POSSIBLE_DUPLICATE`
issue. A wrong merge silently attaches one customer's bookings to another
person; a duplicate is visible and reversible. The asymmetry is deliberate.

Merging moves every service onto the survivor, fills gaps from the record being
retired, archives the duplicate rather than deleting it, and is audited.

---

## 8. Master data and aliases

**Source:** `packages/shared/src/rules/alias.ts`

Resolution order:

1. exact canonical name → linked
2. exact approved alias → linked
3. similarity ≥ 0.82 with a clear margin → **suggested only**
4. otherwise → unresolved, queued for review

A fuzzy hit is never applied. `SAMA` and `SAMA TOURS` may be one partner or two,
and only someone at the company knows which. Until they say, the raw value is
kept on the record and the question stays open in Master Data → *Values needing
review*.

Arabic matching folds letter variants (`البكرى` ≡ `البكري`), diacritics and
tatweel, so the same agency written either way resolves to one partner.

---

## 9. Concurrency

Records that several people edit at once carry a `version` counter. A client
that submits the version it read gets a `STALE_RECORD` conflict if the record
changed in the meantime, rather than overwriting a colleague's edit.

Multi-entity operations — creating a booking with its stays and rooms, applying
an import, recording a payment and re-deriving the document status — run inside
a database transaction.

---

## 10. Access control

**Source:** `packages/shared/src/domain/permissions.ts`

Access is by permission, never by role name. Roles are editable bundles; code
never checks `if (role === 'ADMIN')`.

Effective permissions = union of role permissions + per-user grants − per-user
revocations, recomputed from the database on **every request** so revoking
access takes effect immediately rather than when a token expires.

| Protection | Behaviour |
| --- | --- |
| Self-escalation | Nobody may change their own roles or permissions |
| Last Super Admin | Cannot be demoted or deactivated |
| Super Admin role | Always holds every permission; cannot be narrowed |
| API keys | Read-only scopes; finance and admin permissions are stripped |
| Visa amounts | Omitted from responses without `visas.finance.read` |
| Password change | Revokes every other session |

---

## 11. Data quality

Issues are persistent and identified by a stable fingerprint over category,
entity, field and source row. Re-running analysis updates an existing issue
rather than duplicating it — and, importantly, **does not reopen one a person
has already resolved**.

An issue closes only by being resolved, or ignored **with a stated reason**. A
page refresh never clears one.

---

## 12. Import

**Source:** `packages/shared/src/parsers/rows.ts`, `apps/api/src/modules/imports/`

| Rule | Behaviour |
| --- | --- |
| Analysis writes nothing | Upload and analysis are always a dry run |
| Apply is one transaction | The whole workbook lands, or none of it does |
| Re-importing an applied file | Refused by SHA-256 checksum |
| An ambiguous value | Kept raw + issue raised; never replaced by a guess |
| Every scanned row | Accounted for as master, continuation, structural, blank or unresolved |
| Missing year | Taken from the sheet's dominant year, flagged `ASSUMED_YEAR` |

The reconciliation report is the acceptance criterion: scanned rows must equal
mapped + structural + blank + unresolved, per sheet and overall. If it does not
balance, the import is not trustworthy and says so before anyone applies it.

Detail in `docs/C-IMPORT-ALGORITHM.md`.

---

## Test coverage

`packages/shared` — 129 unit tests over date, time, money, phone and count
parsing; continuation-row grouping; finance calculations and legacy
reconciliation; state machines; duplicate matching; alias resolution.

The parser tests use the **actual values from the supplied workbooks** —
`22 يوليـو`, `31 april`, `AT NOON`, `22:30 PM`, `116000 + 58000 LE`, `credit`,
the stray `د`, and the float-stored phone numbers — so a regression that breaks
the real data fails the suite.
