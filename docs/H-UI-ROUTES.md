# H — Screens, Navigation and Localisation

## Navigation

Permission-aware: a section disappears entirely when a user holds none of its
permissions, so a transfer coordinator never sees Finance. The API enforces the
same permissions independently — hiding a link is a courtesy, not a boundary.

```
Dashboard

Operations
  Today's Operations      /operations
  Trip Files              /trips
  Hotel Bookings          /hotel-bookings
  Transfers               /transfers
  Excursions              /excursions
  Visas                   /visas

Finance
  Overview                /finance
  Payables                /finance/payables
  Payments                /finance/payments
  Partner Settlements     /finance/settlements
  Reconciliation          /finance/reconciliation

Master Data
  Travellers              /travelers
  Hotels                  /master-data/hotels
  Travel Agencies         /master-data/partners
  Excursions              /master-data/excursions
  Locations               /master-data/locations
  Room Types              /master-data/room-types
  Meal Plans              /master-data/meal-plans
  Drivers                 /master-data/drivers
  Vehicles                /master-data/vehicles

Data
  Import Center           /imports
  Matching                /matching
  Data Quality            /data-quality
  Reports / Export        /reports

Administration
  Users & Access          /admin/users
  Audit Log               /admin/audit
  API & Integrations      /admin/api-keys
  Settings                /admin/settings
```

## The app shell

Desktop: a collapsible navy sidebar carrying the brand mark, a top bar with
global search, language switcher, theme toggle, notifications and the user menu,
then the page.

Mobile: a menu trigger, the logo, and the sidebar as a drawer that slides from
the inline-start edge — so it mirrors correctly in Arabic without a second
implementation.

The collapsed state and theme are remembered per device in `localStorage`. They
are conveniences: a failed read renders the default rather than breaking.

## Key screens

**Dashboard** — operational counters, today's chronological timeline, a *needs
attention* panel grouped by problem kind, and recent colleague activity. No
decorative charts; every figure links to the list that explains it.

**Today's Operations** — the day sheet the desk works from. One date, every
service type, chronological. Filterable by section (arrivals, departures, hotel,
excursions), with timeline and table views. Rows show what is *not* ready:
a missing pickup time, an unassigned driver, a security approval.

**Trip Files** — the list, then the detail: tabs for overview, travellers,
hotels, transfers, excursions, visa, finance, attachments and timeline, each
URL-backed (`?tab=hotels`) so a refresh, a shared link and the Back button all
land on the same place. The overview builds a day-by-day timeline **from the
actual child services**, so it reflects what is really booked rather than a
stored copy that could drift.

**Travellers** — the list, then a detail page with the same tab architecture:
every trip file, hotel stay, transfer, excursion and visa for one person. Visa
amounts are omitted from the response without the visa finance permission.

**Matching** — values the importer could not resolve, with four decisions: link
to the suggestion, choose a different record, create as new, or reject. See
`docs/J-TABS-HELP-AND-INTEGRATION.md`.

Where a record came from an import, the source workbook, sheet and row are shown
at the top.

**Transfers** — list and dispatch board over the same data. Assign a driver and
vehicle, or move a leg through the workflow, without leaving the row. Legs with
an unreadable pickup time show the original text in warning colour rather than a
blank or an invented time.

**Import Center** — seven URL-backed workflow tabs: overview, file, mapping,
matching, issues, preview and reconciliation. Each is a real stage, and a stage
that cannot be used yet renders disabled *with the reason*. The reconciliation
is stated plainly at the top:
*every scanned row is accounted for*, or *rows are unaccounted for — review
before applying*. Per-sheet figures, the detected column mapping, unmapped
columns, and the issue list. Applying is a deliberate second step behind a
confirmation that restates what will be created.

**Finance** — payables with derived balances, a payment history per document,
and *Record payment* rather than an editable paid total. Reconciliation shows
the legacy figures next to the calculated balance for every imported row where
they disagree.

**Data Quality** — the issue queue, filterable and assignable. Closing an issue
as ignored requires a reason.

## Tabs and contextual help

Tabs are URL-backed and declared in a registry that carries the label,
permission, count and help for each — so the tab bar, the permission check and
the help text cannot drift apart. Contextual help has three levels (field
tooltip, page guide, inline notice), all keyboard-operable rather than
hover-only. Full detail in `docs/J-TABS-HELP-AND-INTEGRATION.md`.

## Command palette

`Ctrl/Cmd + K`. Searches trips, travellers, hotel bookings, transfers,
excursions, visas, hotels, partners and payables, grouped by type.

Results come from the API, which filters them by the caller's permissions — so
the palette cannot become a way to discover records someone may not open.

## Data tables

One reusable foundation across every list: server-side paging, sorting,
filtering and search; column visibility; loading skeletons; empty and error
states; Excel export.

List state lives in the URL. A coordinator can bookmark *unassigned transfers
this week*, share it, and land on the same view after a refresh.

Below `md`, the same rows render as cards. A twelve-column grid squeezed into
360px is unusable, and a transfer coordinator genuinely does read this on a
phone. Each card leads with the two fields that identify the row, then the rest
as labelled pairs.

## Arabic and English

Arabic is real RTL, not a translated LTR page.

**Direction.** `dir` and `lang` are set on `<html>` and change with the locale.
Layout uses CSS logical properties throughout — `ms-*`, `me-*`, `ps-*`, `pe-*`,
`start-*`, `end-*` — so the mirror is genuine: the sidebar, drawer, dialogs,
table alignment, dropdown anchoring and toasts all flip. Directional icons carry
`flip-rtl`, and paging chevrons swap.

**Fonts.** IBM Plex Sans Arabic for Arabic, Inter for Latin, loaded together as
CSS variables so a mixed-script row keeps a consistent weight. Arabic gets more
line height; numerals stay Western in both languages so figures align in tables.

**Status values.** The database stores `CONFIRMED`. English reads *Confirmed*,
Arabic reads *مؤكد*. A translated label is never persisted — otherwise the same
status would be two different values depending on who entered it.

**Errors.** The API returns a stable code; the web app maps it to a localised
message. No English from the backend reaches the user.

**Dictionary integrity.** `ar.ts` is typed against the English dictionary's
shape, so a key added on one side and forgotten on the other fails the build.

## Breakpoints

Designed at 360, 390, 430, 768, 1024 and 1440 px.

- `< 768` — cards instead of tables, drawer navigation, filters in a bottom
  sheet, dialogs as bottom sheets
- `768–1024` — tables with the less critical columns hidden by default
- `> 1024` — full layout with the collapsible sidebar

## Design

A restrained internal operations tool. Brand navy from the supplied logo as the
single accent; everything else neutral or a semantic status colour. Compact
density, strong typography, subtle borders, careful table design.

No gradients, glassmorphism, decorative blobs, emoji icons or charts that carry
no information.

Light and dark are each defined deliberately rather than one being an inversion
of the other: the dark palette sits on a cool navy that belongs with the brand
mark, and status colours are re-picked for contrast on dark.

## The logo

`apps/web/public/brand/elbakri-logo.png` and `elbakri-logo-white.png` are the
original supplied files, byte for byte. They are never redrawn, vectorised,
recoloured, retyped as text or altered in any way, and are always rendered with
`object-fit: contain`.

Where the mark needs a dark ground — the sidebar, the login panel — **the
surface behind it changes**, and the supplied white artwork is used. The file
itself does not change.
