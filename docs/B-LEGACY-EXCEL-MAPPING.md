# B — Legacy Excel Mapping

Every worksheet in the four supplied workbooks, what it holds, and where each
column ends up in the system.

The governing rule throughout: **no meaningful legacy value is ever discarded.**
A value either maps to a normalised field, or it is preserved verbatim in
`legacySource` / a `*Raw` column and surfaced as a data-quality issue. Where the
source is ambiguous, the ambiguity is preserved and flagged — it is never
resolved by guessing.

## Source workbooks

| Workbook | Worksheets | Rows scanned | Status |
| --- | --- | --- | --- |
| `ELBAKRI OVER SEAS BOOKING .xlsx` | `Sheet1`, `Sheet2` | 998 | Mapped / empty |
| `ُELBAKRI OVER SEAS EX.xlsx` | `Sheet1` | 989 | Mapped |
| `ELBAKRI OVER SEAS FOR TRANSFER .xlsx` | `TRANSFER`, `VISA` | 1,017 | Mapped |
| `PYAMNT.xlsx` | `payment `, `SAMA` | 1,009 | Mapped |

> The workbook filename `ُELBAKRI OVER SEAS EX.xlsx` begins with an Arabic damma
> (U+064F) before the `E`. This is preserved exactly; the importer identifies
> sheets by their content, not their filename.

## Reconciliation of the supplied files

Produced by `npm run import:legacy -w @elbakri/api`. Every scanned row is
accounted for as exactly one of: master record, continuation row, structural
row (banner / header / section divider), blank spacer, or unresolved.

| Workbook | Sheet | Scanned | Blank | Structural | Master | Continuation | Unresolved | Warnings | Errors | Balanced |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| BOOKING | `Sheet1` | 998 | 764 | 1 | 214 | 19 | 0 | 26 | 3 | yes |
| BOOKING | `Sheet2` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | yes |
| EX | `Sheet1` | 989 | 901 | 2 | 44 | 42 | 0 | 34 | 2 | yes |
| TRANSFER | `TRANSFER` | 996 | 668 | 2 | 149 | 177 | 0 | 174 | 2 | yes |
| TRANSFER | `VISA` | 21 | 12 | 3 | 5 | 1 | 0 | 0 | 0 | yes |
| PYAMNT | `payment ` | 1,005 | 810 | 2 | 192 | 1 | 0 | 3 | 7 | yes |
| PYAMNT | `SAMA` | 4 | 0 | 2 | 2 | 0 | 0 | 0 | 0 | yes |

**846 meaningful rows** across the four workbooks, all accounted for.

## Structural conventions shared by every sheet

### Merged cells

The sheets are heavily merged — `Sheet1` of the booking workbook alone contains
2,296 merged ranges, and a single record typically occupies two physical rows.
Only the merge anchor carries the value.

The reader takes each value at its anchor and treats the covered cells as empty.
Reading the merge naively would duplicate one record down every row it spans.

### Blank-NAME continuation rows

A row with no NAME but with service data continues the record above it. This is
how the sheets encode a second hotel stay, a return transfer leg, or another
excursion for the same customer.

```
TRANSFER row 8   ANDRE JO BEILY   AIRPORT SHARM -> SUNRISE ARABIAN   04 May
TRANSFER row 10  (no name)        SUNRISE ARABIAN -> AIRPORT SHARM   09 May
```

Row 10 is Andre's return leg. Imported row-by-row it becomes an anonymous
traveller and the journey is severed. The parser therefore carries an active
master record and attaches blank-name rows to it.

A single blank spacer row between records does **not** end a group (the sheets
use one routinely); a run of more than three does.

### Section rows

Row 18 of the `VISA` sheet reads `new 2026`, padded with leading spaces to
centre it. It is a divider, not a traveller. Rows whose only content is a label
matching a year, month or `new <year>` pattern are recorded as sections; the
label is stamped onto the records that follow, and no customer is created.

### Unmapped columns

Columns not claimed by a layout are preserved on the imported row in
`unmappedValues` and reported as `UNKNOWN_LEGACY_COLUMN`. In the supplied files:

| Sheet | Column | Values found |
| --- | --- | --- |
| `EX/Sheet1` | `W` | `waleed` (row 118) |
| `TRANSFER` | `S` | a time value at row 277 — a pickup time entered one column early |
| `TRANSFER` | `W` | `عوده فقط` ("return only", row 197) |
| `TRANSFER` | `X` | `waleed` (row 191) |

---

## 1. Hotel bookings — `ELBAKRI OVER SEAS BOOKING .xlsx` / `Sheet1`

Header row 8. 214 master records, 19 continuation rows.

| Col | Header | Field | Target |
| --- | --- | --- | --- |
| A | NAME | `name` | `Traveler.fullName` → `TripFile.leadTraveler` |
| D | NATIONALITY | `nationality` | `Traveler.nationalityId` (via alias) + `nationalityRaw` |
| F | PHONE | `phone` | `Traveler.phoneRaw` / `phoneNormalized` / `phoneDigits` |
| H | CHECK IN | `checkIn` | `HotelStaySegment.checkIn` + `checkInRaw` |
| J | CHECK OUT | `checkOut` | `HotelStaySegment.checkOut` + `checkOutRaw` |
| L | HOTEL | `hotel` | `HotelStaySegment.hotelId` (via alias) + `hotelRaw` |
| O | TYPE ROOM | `roomType` | `RoomAllocation.roomTypeId` + `roomTypeRaw` + `quantity` |
| Q | MEAL PLAN | `mealPlan` | `HotelStaySegment.mealPlanId` + `mealPlanRaw` |
| S | BOOKING DATE | `bookingDate` | `HotelBooking.bookingDate` |
| U | TRAVEL AGENCY | `agency` | `HotelBooking.partnerId` (via alias) |
| W | *(no header)* | `notes` | `HotelBooking.notes`; also sets `securityApprovalRequired` |
| Z | *(no header)* | `legacyExtra` | appended to `HotelBooking.notes` |

One named row plus its continuation rows becomes **one** `HotelBooking` with
several `HotelStaySegment` rows. `nights` is derived on the server from the two
dates and is never accepted from a client.

A leading figure in TYPE ROOM (`3 dbl standard`, `5 double`) is read as the room
count into `RoomAllocation.quantity`.

Column W carries `with security approvel` on some rows; the flag is set from
that text and the original note is kept.

## 2. Excursions — `ُELBAKRI OVER SEAS EX.xlsx` / `Sheet1`

Header row 6. 44 master records, 42 continuation rows.

| Col | Header | Field | Target |
| --- | --- | --- | --- |
| A | NAME | `name` | `Traveler.fullName` |
| D | PAXS | `pax` | `ExcursionBooking.paxCount` |
| E | CHILD | `child` | `ExcursionBooking.childCount` |
| G | PHONE | `phone` | `Traveler.phone*` |
| I | NATIONALITY | `nationality` | `Traveler.nationalityId` + `nationalityRaw` |
| K | HOTEL | `hotel` | `ExcursionBooking.hotelId` + `hotelRaw` |
| M | EX | `excursion` | `ExcursionItem.catalogItemId` + `activityRaw` |
| O | DATE | `date` | `ExcursionItem.serviceDate` + `serviceDateRaw` |
| Q | REST | `rest` | **`ExcursionBooking.legacyRestRaw` — verbatim, uninterpreted** |
| S | TRAVEL AGENCY | `agency` | `ExcursionBooking.partnerId` |
| U | NOTES | `notes` | `ExcursionBooking.notes`; sets `transferRequired` |

One customer with several activities becomes **one** `ExcursionBooking` with
several `ExcursionItem` rows — not several customers:

```
row 12  NAWEL BELHADI  3 pax  NOVOTEL BEACH  RAS MOHAMED  14 May
row 14  (no name)                            GLASS BOAT   15 May
row 15  (no name)                            SAFRI DBL    15 May
row 16  (no name)                            DAHAB        16 May
```

### The REST column

**Its business meaning is not established by the source material.** The column
holds `NO` on most rows and occasionally something else.

No financial or operational meaning is assigned to it. The exact text is stored
in `legacyRestRaw`, shown on the excursion order with a note explaining that it
is unmapped, exported verbatim in the legacy-layout report, and raised as an
`AMBIGUOUS_VALUE` issue whenever it holds anything other than a plain `NO`.

An administrator can define its meaning later and migrate the stored values; the
system does not pre-empt that decision.

### Notes

`WITH TRANSFER TO THIS ACTIVITIES` sets `ExcursionItem.transferRequired`. This is
a confident structural reading, and the note text is kept regardless.

## 3. Transfers — `ELBAKRI OVER SEAS FOR TRANSFER .xlsx` / `TRANSFER`

Header row 6. 149 master records, 177 continuation rows — more legs than
bookings, which is exactly the one-to-many shape this sheet encodes.

| Col | Header | Field | Target |
| --- | --- | --- | --- |
| A | NAME | `name` | `Traveler.fullName` |
| D | PHONE | `phone` | `Traveler.phone*` |
| F | FROM | `from` | `TransferLeg.fromLocationId` + `fromRaw` |
| H | TO | `to` | `TransferLeg.toLocationId` + `toRaw` |
| J | PAXS | `pax` | `TransferBooking.paxCount` + `paxCountRaw` |
| L | NATIONALITY | `nationality` | `Traveler.nationalityId` |
| N | DATE | `date` | `TransferLeg.serviceDate` + `serviceDateRaw` |
| P | FLIGHT NUMBER | `flight` | `TransferLeg.flightNumber` |
| R | PICKUP | `pickup` | `pickupTimeMinutes` + `pickupTimeRaw` + `pickupTimeParseStatus` |
| T | TRAVEL AGENCY | `agency` | `TransferBooking.partnerId` |
| V | NOTES | `notes` | `TransferLeg.notes`; sets security / flower flags |

`direction` is inferred from the endpoints: airport → hotel is `ARRIVAL`,
hotel → airport is `DEPARTURE`, hotel → hotel is `INTER_HOTEL`.

PAXS is not always numeric — `3 with child` appears. The figure is taken and the
qualifying text kept in `paxCountRaw`.

Driver and vehicle are **not** in the legacy sheet and are left unset. The
import never invents an assignment.

### Pickup time formats found

| Form | Example | Handling |
| --- | --- | --- |
| Native Excel time | `19:00:00` | Used directly |
| Spaces around colon | `19 : 20`, `15 :00` | Parsed |
| Meridiem with spacing | `9 :30 AM`, `12 : 00 PM` | Parsed |
| Contradictory meridiem | `22:30 PM` | 24-hour reading kept, flagged |
| Mistyped separator | `13;10`, `16;50 pm` | Parsed (`;` neighbours `:`) |
| Descriptive | `AT NOON` | Approximated to 12:00, flagged, confidence 0.4 |
| Unreadable | `nj` | Not parsed; raw kept, ERROR raised |

An unparsed pickup leaves `pickupTimeMinutes` null, shows the original text in
the UI in warning colour, and appears on the dashboard under *transfers without
a pickup time*.

## 4. Visas — `ELBAKRI OVER SEAS FOR TRANSFER .xlsx` / `VISA`

Header row 6. 5 master records, 1 continuation, 1 section divider.

| Col | Header | Field | Target |
| --- | --- | --- | --- |
| A | NAME | `name` | `Traveler.fullName` |
| D | PHONE | `phone` | `Traveler.phone*` |
| F | FROM | `from` | `VisaOrder.originRaw` |
| H | TO | `to` | `VisaOrder.destinationRaw` |
| J | PAXS | `pax` | `VisaOrder.paxCount` |
| L | NATIONALITY | `nationality` | `Traveler.nationalityId` |
| N | DATE | `date` | `VisaOrder.serviceDate` + `serviceDateRaw` |
| P | TRAVEL AGENCY | `agency` | `VisaOrder.partnerId` |
| R | NET | `net` | `VisaOrder.netAmount` |
| T | SELL | `sell` | `VisaOrder.sellAmount` |

**Margin is not a column.** It is computed as `sell − net` on every read and is
never stored, so it cannot drift from the amounts it comes from.

`VisaApplicant` exists for per-passenger documents but the legacy sheet recorded
only an aggregate PAX count, so imported orders have no applicant rows. Adding
them later does not invalidate the aggregate.

Row 18 (`new 2026`) is a section divider — see *Section rows* above.

## 5. Payments — `PYAMNT.xlsx` / `payment `

Header row 3. 192 master records. Note the trailing space in the sheet name.

| Col | Header | Field | Target |
| --- | --- | --- | --- |
| A | HOTEL NAME | `hotelName` | `Counterparty` (type `HOTEL`) + `FinancialDocument.serviceDescription` |
| D | TOTAL PAYMENT | `total` | `FinancialDocument.totalAmount` + `legacyTotalRaw` |
| F | PAID | `paid` | a `PaymentTransaction` + `legacyPaidRaw` |
| H | REST | `rest` | `legacyRestRaw` only — **never** used as a balance |
| J | DATE OF PAYMENT | `paymentDate` | `PaymentTransaction.paymentDate` + `legacyPaymentDateRaw` |
| L | CHECK IN | `checkIn` | `FinancialDocument.serviceDate` / `dueDate` |
| N | *(no header)* | `status` | `FinancialDocument.notes` + `legacyStatusRaw` |

### Why REST is not imported as a balance

The workbook's arithmetic is inconsistent. Of the 38 rows where all three
columns are numeric, **10 do not satisfy `total − paid = rest`**:

| Row | Hotel | Total | Paid | REST | `total − paid` | Reading |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 29 | sunrise tucana | 11,545 | 34,625 | 46,170 | −23,080 | REST = total + paid |
| 41 | stella di mare | 29,700 | 9,700 | 29,700 | 20,000 | REST left at the original total |
| 54 | amwaj oyoun | 9,400 | 9,400 | 18,800 | 0 | REST = total + paid |
| 60 | ALBATROS PALACE | 1,100 | 1,603 | 2,776 | −503 | REST = total + paid |
| 313 | Amwaj Oyoun | 525 | 103 | 408 | 422 | unexplained |

REST was used as a remainder on some rows and a running total on others.

So the system rebuilds the ledger: the total becomes a payable, any paid amount
becomes a payment transaction, and **outstanding is derived** as
`total − Σ(posted payments)`. Where the legacy REST disagrees with that balance,
a `FINANCIAL_RECONCILIATION_MISMATCH` issue is raised and both figures are shown
side by side in Finance → Reconciliation. The historical numbers are never
altered.

### Money values found

`23500 LE`, `45,900 LE`, `92,700 LE`, `116000 + 58000 LE`, `3050 credit`,
`credit`, `-`, `.`, `---------`, `_____________`, `45900 EG`, and a lone Arabic
letter `د` in the REST column of row 18.

`parseFloat` would turn `23500 LE` into `23500` and silently drop the currency,
and `credit` into `NaN`. The money parser instead extracts the amount, the
currency, and any payment-method word; sums an additive expression while
recording its components; recognises `-` and `----` as blank markers rather than
zero; and refuses to produce a figure for `credit` or `د`, raising a
`MONEY_PARSE_ERROR` with the original text intact.

## 6. Partner settlements — `PYAMNT.xlsx` / `SAMA`

Two rows of ad-hoc settlement notes, in Arabic, with amounts.

| Col | Field | Target |
| --- | --- | --- |
| A | `description` | `Settlement.description` (+ `descriptionAr` when Arabic) |
| D | `amount` | `Settlement.totalAmount` |
| H, J, L | `extra1..3` | `Settlement.notes` |

Imported as `Settlement` rows against a generic `Partner`. **Nothing here is
specific to SAMA** — SAMA is one partner record, and the same
`Partner` / `Settlement` / `PaymentTransaction` structure serves any other.

## 7. Empty sheet — `ELBAKRI OVER SEAS BOOKING .xlsx` / `Sheet2`

Zero data rows. Reported as *sheet detected, 0 data rows, no mapping required*.
No features are invented for it. Should it gain data later, the analyser detects
the layout from the header text on the next import.

---

## Master data and aliases

The workbooks spell the same entity many ways. Resolution is deterministic —
canonical name, then approved alias — and a similarity hit is only ever a
**suggestion** shown for review. Two partners are never merged automatically.

Agency spellings found in the booking sheet alone:

| Canonical | Spellings in the source |
| --- | --- |
| ELBAKRI OVERSEAS | `elbakri` (50), `ELBAKRI` (15), `البكري اوفرسيز` (10), `البكري اوفر سيز`, `ELBAKRI OVER SEAS`, `ELBAKRIOVER ESAS`, `elbakrioverseas`, `albakri overseas`, `ELBKRI`, `البكرى اوفر سيز` |
| SAMA | `sama` (19), `Sama`, `SAMA TOURS`, `sama tours`, `sama  tours`, `SAM`, `samah` |
| YELLOW | `yelow` (6), `yellow` (3), `YELOW`, `Yelow` |
| TAZKARA | `tazkra` (6), `tazkara` (4), `Tazkra`, `Tazkara`, `tazkarta` |

Meal plans arrive as `all`, `bb`, `soft`, `sal`, `SAL`, `SAI`, `B>B`, `H ,B`,
`b.b`, `full borad`, `half borad`, `all incluisve`, `bed only`,
`سـوفت اول انكلوسيف`. Nationalities as `egy`, `EGY`, `eg`, `egyt`, `مصرى`,
`leb`, `lebanse`, `lebanes`, `ALGERIENNE`, and compound values such as
`Saudi, Egy` and `1 Algerian + 1 French`.

The seed ships these spellings as approved aliases so a first import resolves
most values without review. Anything unmatched lands in
Master Data → *Values needing review*, where it can be linked to an existing
record, promoted to a new one, or rejected — and the decision is audited.

Arabic matching folds letter variants (`البكرى` ≡ `البكري`), diacritics and
tatweel, so the same agency written either way resolves to one partner.

## Date formats found

| Form | Example | Handling |
| --- | --- | --- |
| Native Excel date | `2025-07-22` | Used directly |
| Excel serial | `45860` | Converted, allowing for the 1900 leap-year bug |
| Arabic month | `22 يوليـو`, `25 ابريل` | Parsed; year assumed from the sheet, flagged |
| Misspelled English | `7 AUGAST`, `31 auguest` | Parsed against a misspelling list |
| Impossible date | `31 april` | **Not parsed** — raw kept, ERROR raised |
| Two dates in one cell | `3 april, 8 april` | **Not parsed** — refuses to choose |
| Unknown text | `arrival`, `3 luly`, `sama tours` | **Not parsed** — raw kept, ERROR raised |
| Blank marker | `-`, serial `0` | Recognised as empty, not as a date |

Where a year is missing, the sheet's own dominant year is used rather than the
current year — and every such date is flagged `ASSUMED_YEAR`. Defaulting to
"now" would silently backdate a 2025 booking imported in 2026.

## Phone numbers

The sheets stored phones as floating-point numbers, which destroys leading
zeros and can render long numbers in exponential form.

`phoneRaw` always holds the original. `phoneDigits` and `phoneNormalized`
(E.164) are populated only when the country can be determined without guessing;
a restored Egyptian leading zero is marked `RESTORED_LEADING_ZERO_EGYPT` and
`ASSUMED_COUNTRY_FROM_LOCAL_FORMAT` so it is visibly an inference.

## Data-quality issues raised by the supplied files

| Category | Count | Example |
| --- | ---: | --- |
| `PHONE_PARSE_ERROR` | 159 | Floats with lost leading zeros |
| `AMBIGUOUS_VALUE` | 35 | `3 with child` in PAXS |
| `TIME_PARSE_ERROR` | 20 | `AT NOON`, `nj` |
| `DATE_ERROR` | 21 | `31 april`, `3 luly`, `arrival` |
| `MONEY_PARSE_ERROR` | 4 | `credit`, `د` |
| `UNKNOWN_LEGACY_COLUMN` | 5 | Columns W, X, S |

Plus, raised during apply: `UNKNOWN_ALIAS` for unresolved master data,
`POSSIBLE_DUPLICATE` for travellers that resemble an existing record, and
`FINANCIAL_RECONCILIATION_MISMATCH` for the payment rows above.

Every issue is persistent, assignable, and closable only by resolving it or
ignoring it **with a stated reason**. A refresh never clears one.
