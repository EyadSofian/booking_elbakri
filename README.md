<p align="center">
  <img src="apps/web/public/brand/elbakri-logo.png" alt="ELBAKRI OVERSEAS" width="360">
</p>

# ELBAKRI OVERSEAS — Operations Platform

Booking, operations and finance management for ELBAKRI OVERSEAS.

This replaces a set of Excel workbooks with a normalised bilingual operations
system. It is not a spreadsheet viewer: the workbooks are treated as legacy
source-of-truth material, migrated into a real relational model, with every
value either mapped to a field or preserved and flagged for review.

The system answers, quickly: who arrives today, who leaves today, which
transfers need action, which visas are still pending, what is outstanding, what
belongs to this customer, what a colleague changed, and which imported rows have
a problem.

---

## Contents

- [Architecture](#architecture)
- [What makes this more than a CRUD app](#what-makes-this-more-than-a-crud-app)
- [Requirements](#requirements)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Migrating the legacy workbooks](#migrating-the-legacy-workbooks)
- [Tests](#tests)
- [Deployment](#deployment)
- [Backup and recovery](#backup-and-recovery)
- [Documentation](#documentation)

---

## Architecture

```
apps/
  api/        NestJS + Prisma + PostgreSQL — the system of record
  web/        Next.js App Router + Tailwind + TanStack Query
packages/
  shared/     Domain enums, permissions, parsers and business rules
data/
  legacy/     Migration inputs (git-ignored — never committed)
docs/         Domain model, mapping, algorithm, rules, RBAC, deployment
```

**The backend is authoritative.** Every financial calculation, status
transition, validation, duplicate check, import decision and permission check
happens on the server. The web app collects input and renders responses; it
holds no business rule of its own.

Pure logic — parsers, finance arithmetic, state machines, matching — lives in
`packages/shared` so it can be unit tested without a database, and is imported
by the API rather than reimplemented.

| Layer | Stack |
| --- | --- |
| API | NestJS 10, Prisma 6, PostgreSQL 16, JWT + refresh rotation, Argon2, Swagger, Helmet, rate limiting |
| Web | Next.js 14 App Router, Tailwind, Radix, TanStack Query + Table, React Hook Form, Zod, Recharts, Sonner |
| Shared | TypeScript, Zod, Jest |

---

## What makes this more than a CRUD app

**One trip file, not four spreadsheets.** A `TripFile` ties a traveller's hotel
stays, transfer legs, excursions, visas and finances together. A customer is
entered once, not re-created per department — while each module stays
independently searchable.

**Finance is a ledger.** `paid` and `outstanding` are derived from payment
transactions on every read. There is no field to type a balance into. A
correction posts a reversal; the original entry is never edited or deleted.

The source workbook's `REST` column disagrees with its own arithmetic on 10 of
the 38 rows where all three figures are numeric — used as a remainder on some
rows and a running total on others. That is precisely why the balance is a
result rather than a field.

**The import proves itself.** Scanned rows must equal mapped + structural +
blank + unresolved, per sheet and overall. If it does not balance, the report
says so before anyone applies it.

**Ambiguity is preserved, not guessed away.** `31 april` is not a date, `AT
NOON` is not a pickup time, `credit` is not an amount. Each keeps its original
text, produces a null value, and raises an issue someone can act on.

**Blank-name rows are continuations.** In the supplied files this covers more
than half the transfer and excursion rows. Read naively, a customer's return
journey becomes an anonymous second traveller.

**Matching asks rather than guesses.** Only an exact name or an approved alias
resolves automatically. A wrong merge silently moves one company's bookings onto
another; a duplicate is visible and reversible.

**Hotel pricing never crosses the boundary.** Hotel identity and description
synchronise from the ELBAKRI Rate Hub; rates stay there. The allowlist is
enforced on both sides and tested from both directions.

---

## Requirements

- Node.js ≥ 20
- PostgreSQL ≥ 14 (16 recommended)
- Docker and Docker Compose (optional, for the local stack)

---

## Local setup

```bash
git clone https://github.com/EyadSofian/booking_elbakri.git
cd booking_elbakri
npm install

cp .env.example .env
# Generate real secrets:
#   openssl rand -base64 48
# and set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET

npm run build:shared          # the API and web both depend on this
npm run prisma:migrate        # create the schema
npm run seed                  # permissions, roles, admin, master data

npm run dev                   # API on :4000, web on :3000
```

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`.
**Change the password immediately.**

Add `SEED_DEMO=true` before seeding for a few clearly fictional records to look
at. It is refused when `NODE_ENV=production`.

### With Docker

```bash
cp .env.example .env      # set the JWT secrets first
docker compose up --build
```

Starts PostgreSQL, the API and the web app. Migrations run at API start-up.

---

## Environment variables

Full list in `.env.example`.

### API

| Variable | Required | Default | Notes |
| --- | :---: | --- | --- |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | yes | — | ≥ 32 chars. `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | yes | — | ≥ 32 chars, different from the above |
| `JWT_ACCESS_TTL` | no | `15m` | Access token lifetime |
| `JWT_REFRESH_TTL_DAYS` | no | `30` | Refresh token lifetime |
| `CORS_ORIGINS` | no | `http://localhost:3000` | Comma-separated |
| `PORT` | no | `4000` | |
| `THROTTLE_LIMIT` | no | `300` | Requests per window |
| `AUTH_THROTTLE_LIMIT` | no | `10` | Sign-in attempts per minute |
| `STORAGE_ROOT` | no | `./storage` | Private storage for uploads |
| `APP_TIMEZONE` | no | `Africa/Cairo` | Operational day boundary |
| `SWAGGER_ENABLED` | no | `true` | Serves `/api/docs` |
| `SEED_ADMIN_EMAIL` | no | `admin@elbakri.local` | Seed only |
| `SEED_ADMIN_PASSWORD` | no | — | Seed only; ≥ 12 chars |

The process validates its environment at boot and **refuses to start** if it is
incomplete, so a missing secret fails loudly rather than at the first request.

### Web

| Variable | Required | Notes |
| --- | :---: | --- |
| `NEXT_PUBLIC_API_URL` | yes | Baked into the client bundle at build time |

### Hotel directory integration (API only)

| Variable | Required | Notes |
| --- | :---: | --- |
| `ELBAKRI_RATE_API_URL` | no | The Rate Hub base URL |
| `ELBAKRI_RATE_INTEGRATION_KEY` | no | Server-to-server key. **Never** `NEXT_PUBLIC_*` |

Server-to-server only — the browser never calls the Rate Hub. Without these the
hotel catalogue still works; only synchronisation is unavailable, and the sync
button says so.

---

## Database

```bash
npm run prisma:migrate                     # create a migration (development)
npm run prisma:deploy                      # apply committed migrations
npm run prisma:studio -w @elbakri/api      # browse the data
npm run seed                               # idempotent; safe to re-run
```

55 models covering identity and access, master data with aliases, travellers and
trip files, the four service modules, the finance ledger, and data governance
(import runs, rows, issues, audit, attachments, notifications).

`prisma db push` is **not** used at any point. Production applies committed
migrations only.

---

## Migrating the legacy workbooks

Place the workbooks in `data/legacy/` — the directory is git-ignored, and real
customer data must never be committed.

**Through the UI:** Data → Import Center → upload → review the reconciliation
and issues → apply.

**From the command line:**

```bash
npm run import:legacy -w @elbakri/api             # analyse only
npm run import:legacy -w @elbakri/api -- --apply  # analyse and apply
```

Output for the supplied files:

```
WORKBOOK: ELBAKRI OVER SEAS BOOKING .xlsx
  SHEET      LAYOUT          SCANNED  BLANK  STRUCT  MASTER  CONT  UNRES  BALANCED
  Sheet1     HOTEL_BOOKING   998      764    1       214     19    0      yes
  Sheet2     EMPTY           0        0      0       0       0     0      yes
  TOTALS: scanned=998 meaningful=233 accountedFor=233 balanced=true
```

All seven sheets across the four workbooks balance: **846 meaningful rows**,
all accounted for. Detail in `docs/B-LEGACY-EXCEL-MAPPING.md`.

Re-uploading an already-applied workbook is refused by SHA-256 checksum.

---

## Tests

```bash
npm test                      # shared + API
npm run test:shared           # 147 unit tests, no database needed
npm run test:api              #  23 — directory boundary, hotel sync
npm run test:e2e -w @elbakri/web   # navigation audit, en/ar x desktop/mobile

python3 scripts/audit-navigation.py   # every internal link resolves
```

The parser tests use the **actual values from the supplied workbooks** —
`22 يوليـو`, `31 april`, `AT NOON`, `22:30 PM`, `116000 + 58000 LE`, `credit`,
the stray `د`, float-stored phone numbers — so a regression that would break the
real migration fails the suite.

Also covered: continuation-row grouping (one master with many children, never
several anonymous travellers), section-row detection, orphan handling,
reconciliation balance, finance arithmetic including the real mismatches from
the payment sheet, state machines, duplicate matching and alias resolution.

---

## Deployment

Both services build from a Dockerfile and are deployed to Railway.

```bash
railway link
railway variables --service elbakri-api --set "KEY=value"
railway up --service elbakri-api
railway up --service elbakri-web
```

`RAILWAY_DOCKERFILE_PATH` selects the Dockerfile per service
(`apps/api/Dockerfile`, `apps/web/Dockerfile`).

The API container runs `prisma migrate deploy` before starting, so a deployment
applies pending migrations from committed files and then serves traffic. Health
probes are version-neutral at `/api/health` and `/api/health/ready`.

Both images run as a non-root user, carry production dependencies only, and
declare a `HEALTHCHECK`.

See `docs/I-DEPLOYMENT.md`.

---

## Backup and recovery

Booking, financial and audit history is not disposable.

```bash
# Nightly logical backup
pg_dump --format=custom --no-owner "$DATABASE_URL" > elbakri-$(date +%F).dump

# Restore
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" elbakri-2026-01-15.dump
```

Beyond backups, the schema itself preserves history: business records are
archived rather than hard deleted, payments are reversed rather than removed,
every material mutation writes an audit entry with before/after snapshots, and
imported records keep their original workbook values untouched.

Railway PostgreSQL should additionally have scheduled backups and
point-in-time recovery enabled.

---

## Documentation

| Document | Contents |
| --- | --- |
| `docs/A-DOMAIN-MODEL.md` | Entities, relationships and the ERD |
| `docs/B-LEGACY-EXCEL-MAPPING.md` | Every worksheet and column, with reconciliation |
| `docs/C-IMPORT-ALGORITHM.md` | Analyse → map → apply → reconcile |
| `docs/D-BUSINESS-RULES.md` | Every rule and why it behaves that way |
| `docs/E-DATA-QUALITY.md` | Issue categories and the review workflow |
| `docs/F-API.md` | Endpoints, envelopes and error codes |
| `docs/G-RBAC.md` | Permissions, roles and their enforcement |
| `docs/H-UI-ROUTES.md` | Screens, navigation and i18n |
| `docs/I-DEPLOYMENT.md` | Deployment and operations |
| `docs/J-TABS-HELP-AND-INTEGRATION.md` | Tab architecture, contextual help, matching, hotel directory |

Interactive API documentation is served at `/api/docs` when
`SWAGGER_ENABLED=true`.

---

## Brand

The ELBAKRI OVERSEAS logo in `apps/web/public/brand/` is the original supplied
artwork, copied byte-for-byte. It is never redrawn, vectorised, recoloured,
retyped as text or otherwise altered. Where it needs to sit on a dark ground,
the surface behind it changes — the file does not.
