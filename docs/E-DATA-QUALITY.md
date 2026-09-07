# E — Data Quality

Where the legacy data is wrong, ambiguous or unreadable, the system says so
rather than guessing. Every such finding becomes a persistent, assignable issue
that closes only when a person resolves it — or explicitly ignores it with a
stated reason.

A page refresh never clears one.

---

## The principle

Three ways to handle a value that cannot be understood:

1. **Drop the row.** Loses real history.
2. **Guess.** Produces a plausible-looking figure nobody can trace.
3. **Import it, preserve the original, and flag it.**

This system does the third, always. `31 april` is not a date, `AT NOON` is not a
pickup time, `credit` is not an amount — each keeps its original text, produces
a null parsed value, and raises an issue.

The record still imports. It still appears on the dispatch board or the payables
list. What it does not do is pretend to a certainty it does not have.

---

## Issue categories

| Category | Raised when |
| --- | --- |
| `DATE_ERROR` | A date is unreadable, impossible, or violates a rule (checkout before checkin) |
| `TIME_PARSE_ERROR` | A pickup time could not be read, or was only approximated |
| `MONEY_PARSE_ERROR` | An amount could not be read as a figure |
| `PHONE_PARSE_ERROR` | A phone could not be normalised with confidence |
| `UNKNOWN_ALIAS` | A hotel, agency, room type or meal plan did not resolve |
| `POSSIBLE_DUPLICATE` | A traveller resembles an existing record but is not identical |
| `ORPHAN_CONTINUATION_ROW` | A row has service data, no name, and no record above it |
| `FINANCIAL_RECONCILIATION_MISMATCH` | The legacy REST disagrees with the ledger balance |
| `MISSING_REQUIRED_VALUE` | A field the record cannot operate without is empty |
| `SUSPICIOUS_YEAR` | A year outside 2015–2035 |
| `UNKNOWN_LEGACY_COLUMN` | A column no layout maps; the value is preserved |
| `AMBIGUOUS_VALUE` | Read with low confidence, or meaning undefined (the REST column) |
| `INVALID_STATUS` | A status value outside the state machine |

## Severity

| Severity | Meaning | Example |
| --- | --- | --- |
| `ERROR` | Could not be read at all | `31 april`, `credit`, `nj` |
| `WARNING` | Read with low confidence, or a rule is violated | `AT NOON`, checkout before checkin |
| `INFO` | Noted for visibility | An unmapped column |

Severity describes confidence, not importance. An `INFO` unmapped column may
matter more to the business than a `WARNING` approximate time — which is why
issues are assignable rather than auto-prioritised.

---

## What the supplied workbooks produced

| Category | Count | Examples |
| --- | ---: | --- |
| `PHONE_PARSE_ERROR` | 159 | Floats with lost leading zeros |
| `AMBIGUOUS_VALUE` | 35 | `3 with child` in PAXS |
| `DATE_ERROR` | 21 | `31 april` (×3), `3 luly`, `arrival` (×3) |
| `TIME_PARSE_ERROR` | 20 | `AT NOON`, `13;10`, `nj` |
| `UNKNOWN_LEGACY_COLUMN` | 5 | Columns S, W, X |
| `MONEY_PARSE_ERROR` | 4 | `credit` (×2), the stray `د` |

Plus, during apply: `UNKNOWN_ALIAS` for unresolved master data,
`POSSIBLE_DUPLICATE` for near-match travellers, and
`FINANCIAL_RECONCILIATION_MISMATCH` for the 10 inconsistent payment rows.

### Notable real cases

**Row 73 of the excursions sheet** has `lebanese` in the PHONE column and
`sama tours` in the DATE column — the columns were shifted when it was typed.
Both raise errors, and the row imports with both values preserved. A parser that
"cleaned" this would produce a booking with a fabricated date.

**Rows 122, 187, 189, 195 and 349 of the booking sheet** have a checkout before
the checkin (row 122: in 31 Aug 2025, out 3 Aug 2025). The stay imports with
both dates as written and `nights` left null.

**Ten rows of the payment sheet** disagree with their own arithmetic. Row 54:
total 9,400, paid 9,400, REST 18,800 — REST used as a running total rather than
a remainder. The reconciliation recognises this specific pattern and says so.

---

## Fingerprints

Each issue carries a hash over category, entity type, entity id, field and
source row.

Re-running analysis over the same workbook **updates** the existing issue rather
than creating a duplicate — and does not reopen one someone has already
resolved. Without this, every re-analysis would bury the reviewer in issues they
had already dealt with, and the queue would become noise.

---

## The workflow

```
OPEN ──assign──→ REVIEWING ──┬──→ RESOLVED
                             └──→ IGNORED_WITH_REASON
                                     ↑
                                  reopen
```

`GET /api/v1/data-quality` — filter by status, category, severity, entity type,
assignee or import run.

Ignoring an issue **requires** a reason. Dismissing something without recording
why is how a data problem becomes folklore — six months later nobody remembers
whether it was checked or just closed.

Both closures record who did it and when, and are audited.

---

## Where issues surface

**Data Quality** — the full queue, filterable and assignable.

**The dashboard** — open errors appear under *needs attention*, grouped by kind:
transfers without a pickup time, transfers with no driver, checkout before
checkin, visas pending close to travel, overdue payables, data quality errors.

**On the record itself** — a stay with an unparsed check-in shows the original
text in warning colour; a leg with no pickup time shows what the sheet said. The
problem is visible where the work happens, not only in a separate queue.

**The Import Center** — issues for a run, filterable by severity, alongside the
reconciliation.

---

## Preserved raw values

Every field that needed interpretation keeps its original text:

| Field | Raw companion |
| --- | --- |
| `HotelStaySegment.checkIn` / `checkOut` | `checkInRaw`, `checkOutRaw`, and parse status |
| `TransferLeg.pickupTimeMinutes` | `pickupTimeRaw`, `pickupTimeParseStatus` |
| `TransferLeg.serviceDate` | `serviceDateRaw` |
| `Traveler.phoneNormalized` | `phoneRaw`, `phoneDigits` |
| `TransferBooking.paxCount` | `paxCountRaw` |
| `ExcursionBooking` | `legacyRestRaw` |
| `FinancialDocument` | `legacyTotalRaw`, `legacyPaidRaw`, `legacyRestRaw`, `legacyPaymentDateRaw`, `legacyStatusRaw` |
| Unresolved master data | `hotelRaw`, `mealPlanRaw`, `roomTypeRaw`, `fromRaw`, `toRaw`, `nationalityRaw` |

And the whole source row survives in `legacySource` and `import_rows`.

---

## Finance reconciliation

Finance → Reconciliation lists every imported payable whose legacy REST
disagrees with the ledger, showing both side by side:

| Column | Source |
| --- | --- |
| Legacy total / paid / REST | The workbook, verbatim |
| Calculated outstanding | `total − Σ(posted payments)` |
| Difference | `legacyREST − calculated` |
| Reason | Which pattern the mismatch fits |

A finance user with `finance.reconcile` can annotate or resolve each one.

**The original figures are never modified.** They are evidence of what the
company recorded, and the ledger is what the system operates on.

---

## Master data review

Values that did not resolve — a hotel, agency, room type or meal plan the system
has not seen — land in Master Data → *Values needing review*, with the closest
match and a similarity score.

Nothing has been applied. Three choices: link to an existing record, create it
as new, or reject.

Repeated occurrences increment a counter rather than creating a new row, so a
spelling appearing 50 times is one decision, not fifty.

A fuzzy match is never applied automatically. `SAMA` and `SAMA TOURS` may be one
partner or two, and only the company knows which.
