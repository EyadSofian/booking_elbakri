# C — Import Algorithm

How a legacy workbook becomes live records, and why each step behaves the way
it does.

```
Upload ─→ Analyse ─→ Map ─→ Issues ─→ Preview ─→ Apply ─→ Reconcile
         └──────── writes nothing ────────┘      └─ one transaction ─┘
```

The governing constraint: **an import must be able to prove what it did.** At
the end, the number of rows scanned has to equal the number mapped, plus the
structural rows, plus the blanks, plus anything left unresolved. If those do not
balance, something was lost, and the report says so before anyone applies it.

---

## 1. Upload

`POST /api/v1/imports/analyze` — permission `imports.upload`.

The workbook is stored under `STORAGE_ROOT/imports/<sha256>.xlsx` and an
`ImportRun` records the filename, checksum, size, uploader and timestamp.

**Nothing is written to business tables.** Upload and analysis are always a dry
run, so an operator can look at what a file would do before committing to it.

### Duplicate protection

A workbook whose SHA-256 matches a run already in `APPLIED` state is refused.
Without this, re-uploading the same file would duplicate every record in it —
and the second import would look exactly as successful as the first.

The same file may be analysed repeatedly; only applying it twice is blocked.

---

## 2. Analyse

### 2a. Reading the workbook

**Source:** `apps/api/src/modules/imports/workbook-reader.ts`

Two behaviours matter for these files.

**Merged cells.** The sheets are heavily merged — `Sheet1` of the booking
workbook has 2,296 merged ranges, and a record typically spans two physical
rows. Only the anchor holds the value. The reader takes the value at its anchor
and treats the covered cells as empty, so one record stays one logical row
instead of being duplicated down the merge.

**Nothing is dropped.** Columns no layout claims are collected into `unmapped`
and travel with the row into `import_rows.unmappedValues`, each raising an
`UNKNOWN_LEGACY_COLUMN` issue. A column added to the workbook later cannot slip
through unnoticed.

Formula cells yield their cached result, rich text is flattened, and blank-looking
strings become null so they are not mistaken for data.

### 2b. Detecting the layout

The analyser does **not** trust a fixed row number. It scans the first 30 rows
of each sheet looking for a row whose cells match a known layout's header text,
and requires at least 70% of the expected headers to line up before claiming it.

This means a workbook with rows inserted above the header still imports, and a
sheet whose columns have moved is reported rather than silently mis-read.

A sheet matching no layout is reported as *layout not recognised — nothing was
imported from this sheet*, with its non-empty row count, rather than being
ignored. An empty sheet (`Sheet2` of the booking workbook) is reported as
*0 data rows, no mapping required*; no features are invented for it.

Layouts live in `apps/api/src/modules/imports/sheet-profiles.ts`.

### 2c. Grouping rows

**Source:** `packages/shared/src/parsers/rows.ts`

This is the part that decides whether the import is right or nonsense.

```
for each row, in sheet order:

  above the header row      → BANNER
  the header row            → HEADER
  structurally empty        → BLANK   (close the group after a long gap)
  NAME present, and it
    looks like a divider    → SECTION (close the group; remember the label)
  NAME present              → MASTER  (open a new group)
  NAME blank, service data
    and a group is open     → CONTINUATION (attach to that group)
  NAME blank, service data
    and no group is open    → ORPHAN  (raise an issue; import nothing)
```

**Why continuation rows matter.** The sheets leave NAME blank on rows that
continue the record above — a return transfer leg, a second hotel stay, another
excursion:

```
TRANSFER row 8   ANDRE JO BEILY   AIRPORT SHARM -> SUNRISE ARABIAN   04 May
TRANSFER row 10  (no name)        SUNRISE ARABIAN -> AIRPORT SHARM   09 May
```

Row 10 is Andre's return journey. Imported row-by-row it becomes an anonymous
traveller and the outbound and return are severed. In the supplied files this
pattern covers **177 of 326 transfer rows** and **42 of 86 excursion rows** —
more than half the data.

**Blank spacer rows.** The sheets put a blank row between records routinely, so
a single gap does not close a group. A run of more than three does — a far-away
row is not a continuation of something that ended pages ago.

**Section rows.** Row 18 of the `VISA` sheet reads `new 2026`, padded with
leading spaces to centre it. A row whose only content is a label matching a
year, a month, or `new <year>` is recorded as a divider; the label is stamped
onto the records that follow, and no customer is created. Without this the
import produces a traveller called "new 2026".

**Orphans.** A row with service data, no name and no open group is *not*
imported. Guessing an owner would attach someone's transfer to the wrong
customer. It is counted, reported as `ORPHAN_CONTINUATION_ROW`, and left for a
person. The supplied files contain none — but the rule is what makes the
reconciliation trustworthy.

### 2d. Normalising values

**Source:** `apps/api/src/modules/imports/row-normalizer.ts` and
`packages/shared/src/parsers/`

Each mapped column runs through the parser for its declared kind. Every parser
returns the same shape:

```ts
{ raw, value, status, confidence, warnings }
```

`raw` is always the original. `value` is null unless the interpretation is
sound. Statuses are `NATIVE`, `PARSED`, `AMBIGUOUS`, `EMPTY_MARKER`,
`UNPARSEABLE` or `MISSING`; anything `AMBIGUOUS` or `UNPARSEABLE` raises an
issue and the raw text is stored on the record.

**Dates.** Excel serials (correcting for the 1900 leap-year bug), Arabic month
names (`22 يوليـو`), misspelled English (`7 AUGAST`, `31 auguest`), ISO and
numeric forms. It refuses to guess: `31 april` is not a real date, so it is not
parsed; `3 april, 8 april` holds two dates, so it picks neither; `arrival` and
`3 luly` are not dates at all. All keep their raw text and raise a `DATE_ERROR`.

Where a year is missing, the **sheet's own dominant year** is used and the date
is flagged `ASSUMED_YEAR`. Defaulting to the current year would silently
backdate a 2025 booking imported in 2026.

**Times.** Native Excel times and day fractions, `19 : 20`, `9 :30 AM`,
`12 : 00 PM`, `13;10` (semicolon neighbours the colon on the keyboard). `22:30
PM` is contradictory — the 24-hour reading is kept and flagged. `AT NOON` is
approximated to 12:00 at confidence 0.4 and flagged `APPROXIMATE_TIME`, because
a coordinator must confirm it before the day of travel. `nj` is not a time.

**Money.** `parseFloat('23500 LE')` returns `23500` and silently drops the
currency; `parseFloat('credit')` returns `NaN`. The money parser instead
extracts amount, currency and any payment-method word (`3050 credit` → 3050 +
`CREDIT_NOTE`); sums an additive expression while recording its components
(`116000 + 58000 LE`); recognises `-`, `.`, `---------` as blank markers rather
than zero; and refuses to produce a figure for `credit` alone or the stray
Arabic `د` in row 18, raising `MONEY_PARSE_ERROR` with the text intact.

**Phones.** The sheets stored phones as floats, destroying leading zeros.
`phoneRaw` always keeps the original. `phoneNormalized` (E.164) is populated
only when the country is determinable; a restored Egyptian leading zero is
marked `RESTORED_LEADING_ZERO_EGYPT` so it is visibly an inference, not a fact.

**Counts.** `3 with child` yields 3 with the qualifying text preserved.

### 2e. Persisting the analysis

Every non-blank row is written to `import_rows` with its raw values, unmapped
values, normalised values and classification. Issues go to `import_issues`,
linked to their row.

Rows and issues are inserted in bulk with client-generated ids. Inserting them
one at a time costs a round trip per row, which on a thousand-row workbook holds
a transaction open long enough for the connection to be dropped.

---

## 3. Map — alias resolution

**Source:** `apps/api/src/modules/master-data/alias-resolver.service.ts`

Free-text values resolve to master records in strict order:

1. exact canonical name → linked
2. exact approved alias → linked
3. similarity ≥ 0.82 with a clear margin over the runner-up → **suggested only**
4. otherwise → unresolved, queued for review

**A fuzzy match is never applied.** `SAMA` and `SAMA TOURS` may be one partner
or two, and only the company knows which. Until someone says, the raw value
stays on the record and the question stays open in Master Data → *Values
needing review*, where it can be linked, promoted to a new record, or rejected —
and the decision is audited.

Master records are cached in memory for the duration of a run, so resolution
costs one query per entity type rather than one per row.

Arabic matching folds letter variants (`البكرى` ≡ `البكري`), diacritics and
tatweel.

---

## 4. Issues

`GET /api/v1/imports/:id/issues` — filterable by severity and category.

| Severity | Meaning |
| --- | --- |
| `ERROR` | A value could not be read at all |
| `WARNING` | Read with low confidence, or a business rule is violated |
| `INFO` | Noted for visibility, e.g. an unmapped column |

Issues are advisory: an import with errors can still be applied, because the
affected records import with their raw values preserved and the issue attached.
Blocking the whole workbook on one unreadable pickup time would strand hundreds
of good rows.

---

## 5. Preview

`GET /api/v1/imports/:id/preview` returns the classified rows with their issues
before anything is written.

---

## 6. Apply

`POST /api/v1/imports/:id/apply` — permission `imports.apply`.

**One transaction for the whole workbook.** Either all of it lands or none of
it does; a partial import leaving half a booking behind is worse than no import.

For each grouped record the applier:

1. resolves master data (deterministically, or records a suggestion);
2. finds or creates the traveller, using the duplicate rules below;
3. creates the `TripFile` that owns the services;
4. creates the service record, with the master row and every continuation row
   becoming child rows of the **same** record;
5. sets the trip's travel window from the dates just written;
6. writes provenance onto every record.

### Traveller matching during import

Auto-linking requires an **exact normalised name and an identical phone**, and
only when exactly one candidate qualifies. Anything weaker creates a new
traveller and raises `POSSIBLE_DUPLICATE`.

A wrong merge silently attaches one customer's bookings to another person; a
duplicate is visible and reversible from the traveller screen. The asymmetry is
deliberate.

### Provenance

Every created record carries:

```json
{
  "workbook": "ELBAKRI OVER SEAS BOOKING .xlsx",
  "sheet": "Sheet1",
  "row": 122,
  "importRunId": "…",
  "rawValues": { "checkIn": "31 auguest", "…": "…" },
  "unmappedValues": { "Z": ";" }
}
```

`import_rows` is also updated with what each row produced, so the trail runs
both ways: from a record back to its source row, and from a source row forward
to what it became.

### Finance

The payment sheet is rebuilt as a ledger: the total becomes a payable, any paid
amount becomes a `PaymentTransaction`, and the outstanding balance is derived.
The legacy `Total`, `Paid`, `REST`, date and status columns are stored verbatim
alongside. Where REST disagrees with the ledger, a
`FINANCIAL_RECONCILIATION_MISMATCH` is raised — see
`docs/D-BUSINESS-RULES.md`.

---

## 7. Reconcile

`GET /api/v1/imports/:id/reconciliation`

Per sheet and overall:

| Field | Meaning |
| --- | --- |
| `rowsScanned` | Every physical row read |
| `rowsIgnoredAsBlank` | Structurally empty |
| `headerAndSectionRows` | Banners, headers, dividers |
| `masterRecords` | Rows that started a record |
| `continuationRows` | Blank-name rows attached to one |
| `unresolvedRows` | Orphans — counted, not imported |
| `warnings` / `errors` | Issue counts |
| `balanced` | Whether the arithmetic closes |

**The guarantee:**

```
rowsScanned = blank + structural + master + continuation + unresolved
```

Checked per sheet and for the workbook. The Import Center states it plainly at
the top of the run — *every scanned row is accounted for*, or *rows are
unaccounted for — review before applying*.

For the four supplied workbooks this balances on all seven sheets: 846
meaningful rows across 4,013 scanned. Figures in
`docs/B-LEGACY-EXCEL-MAPPING.md`.

---

## Running a migration

Through the UI: Data → Import Center → upload → review → apply.

From the command line, against a running database:

```bash
# Analyse only, printing the reconciliation table
npm run import:legacy -w @elbakri/api

# Analyse and apply
npm run import:legacy -w @elbakri/api -- --apply

# A different directory of workbooks
npm run import:legacy -w @elbakri/api -- --dir /path/to/workbooks --apply
```

The script records the run against an active Super Admin, exactly as the UI
would, so a migration is audited like any other change.

---

## Extending it

To support a new sheet layout, add a `SheetProfile` in `sheet-profiles.ts` with
its column map, the field that starts a record, and the fields that make a
blank-name row meaningful. The analyser detects it by header text; grouping,
parsing, issue reporting and reconciliation come for free.

Handling a new value format means extending the relevant parser in
`packages/shared/src/parsers/` and adding a test with the real value that
prompted it. Parser rules are general — they are not keyed to the row numbers
they were found in.
