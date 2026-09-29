<p align="center">
  <img src="apps/web/public/brand/elbakri-logo.png" alt="ELBAKRI OVERSEAS" width="360">
</p>

# ELBAKRI OVERSEAS — Bookings

One place where **sales register their bookings** and **operations run them** —
hotels, transfers, excursions and visas — replacing the team's Excel sheets.

Every screen can create, edit and change the status of a booking. Nothing is
view-only. Arabic first (right-to-left), English one click away.

> دليل الاستخدام بالعربي للفريق: [`docs/دليل-الاستخدام.md`](docs/دليل-الاستخدام.md)

---

## What is in it

| Screen | Replaces | What people do there |
| --- | --- | --- |
| **Home** | — | Today / tomorrow at a glance: arrivals, departures, the transfer board, requests waiting, this month's sales |
| **Sales** | `شيت حجوزات` | Register a customer booking with its prices; profit, 10 % seller commission and the balance calculate themselves; record payments; send the hotel / transfer to operations |
| **Hotels** | `ELBAKRI OVER SEAS BOOKING` + `PYAMNT` | Hotel bookings, and what is paid / still owed to each hotel |
| **Transfers** | `… FOR TRANSFER` (TRANSFER sheet) | Arrivals, departures and hotel-to-hotel transfers, driver and car, "add return" in one click |
| **Excursions** | `… EX` | Trips and activities per guest |
| **Visas** | `… FOR TRANSFER` (VISA sheet) | Visa requests with net and sell |
| **Reports** | — | Sales money per month and per seller; operations volume per agency |
| **Settings** | — | Team and roles, agencies, hotels (rename / merge spelling variants), **import from Excel**, my account |

All four operations tabs are the same screen with different columns, so they
behave identically: status tabs with counts, date filters (upcoming / today /
tomorrow / past), search, agency filter, a side panel with the details and full
history, edit, duplicate, delete, and export to Excel in the sheet's layout.

### One status list everywhere

`NEW` (طلب جديد) → `IN_PROGRESS` (قيد التنفيذ) → `CONFIRMED` (مؤكد) → `DONE` (تم), or
`CANCELLED` (ملغي). Any status can move to any other; every change is recorded
with who made it and when.

### How sales and operations meet

A sale can ask operations to book its hotel and arrange its transfers (a tick
box when the sale is saved, or the **Request** buttons on the sale). The request
appears in the Hotels / Transfers tab as **New**, linked to the sale; the sale
page shows each request's live status.

### Money, kept simple

* **Sales** follow the sales sheet exactly:
  `total cost = hotel + flight + flight commission + transfers + other service`,
  `total sell = hotel + flight + transfers + other service`,
  `commission = total profit × rate (10 % by default)`, `remaining = total sell − payments`.
* **Hotels** carry what ELBAKRI owes the hotel and what has been paid (the payment sheet).
* Amounts in different currencies are never added together.

---

## Architecture

```
apps/
  api/        NestJS + Prisma + PostgreSQL
  web/        Next.js (App Router) + Tailwind + TanStack Query
packages/
  shared/     The domain (statuses, roles, sale arithmetic, API shapes) and the Excel value parsers
```

The database has twelve small tables: `users`, `sessions`, `agencies`, `hotels`,
`sales`, `sale_payments`, `hotel_bookings`, `transfers`, `excursions`, `visas`,
`activities` (history) and `import_batches`.

Roles: **Admin** (everything), **Sales** (sales and payments; can create
operations requests), **Operations** (the four operations tabs, agencies,
hotels, imports). Checked by the API on every request.

---

## Local setup

```bash
npm install
cp .env.example .env            # set the JWT secrets: openssl rand -base64 48
npm run build:shared
npm run prisma:deploy           # create the tables
npm run seed                    # first admin + the "ELBAKRI OVERSEAS" direct-customers agency
npm run dev                     # API :4000, web :3000
```

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`.

## Importing the Excel sheets

**From the app:** Settings → Import from Excel → choose a file → check what is
new → Import. Each sheet is recognised by its header row. Rows imported before
are skipped, so an updated sheet can be uploaded again. Import the hotel sheet
**before** the payment sheet — payment rows are matched to hotel bookings.

**From the command line:**

```bash
npm run import:sheets -- --dir ~/Downloads/sheets            # preview
npm run import:sheets -- --dir ~/Downloads/sheets --apply    # import
```

What the importer handles: blank-name rows continue the guest above (second
hotel, return transfer, next excursion); merged cells; dates without a year
(`22 يوليو`); check-outs typed with last year's date; swapped flight / pickup
columns; `2 + 1 CH` passengers; agency spellings (`sama`, `SAMA TOURS` → one
agency); meal-plan shorthand (`SAI`, `soft all`, `سوفت اول انكلوسيف` → Soft All
Inclusive). Imported bookings in the past become `DONE`, the rest `CONFIRMED`.

## Checks

```bash
npm run typecheck
npm test                         # shared (sale arithmetic, parsers) + importer
npm run lint
npm run build
```

## Deployment

Both apps build from their Dockerfiles (`apps/api/Dockerfile`, `apps/web/Dockerfile`);
the API applies migrations on start (`prisma migrate deploy`).

**Moving an existing deployment to this version:** the database schema was
rebuilt from scratch (one new migration replaces the old ones), so an existing
database from the previous version must be reset before the first deploy, then
seeded and the sheets imported again. Take a backup first:

```bash
pg_dump --format=custom --no-owner "$DATABASE_URL" > before-reset.dump
```

## Backup

```bash
pg_dump --format=custom --no-owner "$DATABASE_URL" > elbakri-$(date +%F).dump
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" elbakri-2026-01-15.dump
```

Deleting a booking from the screen only hides it (`deletedAt`); its history stays.

---

The ELBAKRI OVERSEAS logo in `apps/web/public/brand/` is the original artwork and is used unaltered.
