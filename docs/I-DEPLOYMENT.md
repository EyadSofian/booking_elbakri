# I — Deployment and Operations

## Topology

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│ elbakri-web│────▶│ elbakri-api│────▶│  Postgres  │
│  Next.js   │     │  NestJS    │     │            │
└────────────┘     └────────────┘     └────────────┘
```

Both services build from a Dockerfile. The API talks to PostgreSQL over the
private network; the web app talks to the API over HTTPS.

## Images

Both are multi-stage, run as a non-root user, carry production dependencies
only, and declare a `HEALTHCHECK`.

**API** (`apps/api/Dockerfile`) — installs only the shared and API workspaces,
builds the shared package, generates the Prisma client, compiles, then prunes
dev dependencies. The runtime image carries `dist`, `node_modules`, the Prisma
schema and its **committed migrations**.

**Web** (`apps/web/Dockerfile`) — Next.js standalone output, so the runtime
carries only the server bundle and the assets it serves. `NEXT_PUBLIC_API_URL`
is a build argument because it is baked into the client bundle.

## Start-up

```sh
npx prisma migrate deploy && node dist/main.js
```

Migrations are applied from committed files before the server accepts traffic.
`prisma db push` is **never** used — it has no migration history, so it cannot
be reviewed, replayed or rolled back.

The process validates its environment at boot and **refuses to start** if it is
incomplete, so a missing secret fails at deploy time rather than at the first
request that needs it.

## Railway

```bash
railway link
railway add --database postgres
railway add --service elbakri-api
railway add --service elbakri-web

railway variables --service elbakri-api \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  --set "JWT_ACCESS_SECRET=$(openssl rand -base64 48)" \
  --set "JWT_REFRESH_SECRET=$(openssl rand -base64 48)" \
  --set "RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile"

railway variables --service elbakri-web \
  --set "NEXT_PUBLIC_API_URL=https://<api-domain>" \
  --set "RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile"

railway domain --service elbakri-api --port 4000
railway domain --service elbakri-web --port 3000

railway up --service elbakri-api
railway up --service elbakri-web
```

`RAILWAY_DOCKERFILE_PATH` is what tells each service which Dockerfile to build
in this monorepo.

Set `CORS_ORIGINS` on the API to the web domain once it exists.

### Health checks

`/api/health` (liveness) and `/api/health/ready` (verifies the database) are
version-neutral, so a probe need not track the API version.

## First run

```bash
railway run --service elbakri-api npm run seed -w @elbakri/api
```

Creates the permission catalogue, the system roles, the first Super Admin from
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, and the master data with the alias
spellings from the legacy workbooks.

**Change the seeded password immediately.** It exists to get you in once.

The seed is idempotent — re-running it updates definitions without duplicating
anything.

## Migrating the legacy data

Through the UI: Data → Import Center. Or from the command line with
`DATABASE_URL` pointed at the target:

```bash
npm run import:legacy -w @elbakri/api            # analyse only
npm run import:legacy -w @elbakri/api -- --apply
```

The apply stage runs in **one transaction per workbook**, so a failure leaves
nothing behind. Run it where latency to the database is low — a migration is
thousands of round trips, and running it across a slow link can exceed the
transaction ceiling. `IMPORT_APPLY_TIMEOUT_MS` raises that ceiling if a
particularly large workbook needs it.

## Docker Compose

```bash
cp .env.example .env      # set the JWT secrets
docker compose up --build
```

PostgreSQL with a named volume, the API with persistent storage for uploads, and
the web app. Migrations run at API start-up.

## Environment

See the README for the full table. The variables that must be set deliberately:

| Variable | Why |
| --- | --- |
| `DATABASE_URL` | — |
| `JWT_ACCESS_SECRET` | ≥ 32 chars, unique per environment |
| `JWT_REFRESH_SECRET` | ≥ 32 chars, different from the access secret |
| `CORS_ORIGINS` | The web origin. Do not leave at the default in production |
| `NEXT_PUBLIC_API_URL` | Build-time on the web service |

Consider `SWAGGER_ENABLED=false` in production if the API is publicly reachable
and the schema need not be.

## Backup and recovery

Booking, financial and audit history is not disposable.

```bash
# Nightly logical backup
pg_dump --format=custom --no-owner "$DATABASE_URL" > elbakri-$(date +%F).dump

# Restore
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" elbakri-2026-01-15.dump
```

Enable Railway's scheduled backups and point-in-time recovery on the Postgres
service as well — a logical dump is a floor, not a strategy.

**Test a restore.** A backup nobody has restored is a hypothesis.

Beyond backups, the schema preserves history in its own right: business records
are archived rather than deleted, payments are reversed rather than removed,
every material mutation writes an audit entry with before/after snapshots, and
imported records keep their original workbook values untouched.

### Uploaded files

`STORAGE_ROOT` holds uploaded workbooks and attachments. On Railway this needs a
persistent volume, or the files vanish on redeploy. Back it up separately — it
is not in the database dump.

## Operations

**Logs.** `railway logs --service elbakri-api`. Every request carries a
correlation id, returned in `X-Request-Id` and quoted in error responses, so a
user's report can be traced to the exact request.

**Rate limits.** 300 requests/minute by default, 10/minute on sign-in.

**Sessions.** Revocable per device or in bulk. Deactivating a user, changing a
password or an admin reset all revoke sessions immediately.

## Scaling

The API is stateless apart from `STORAGE_ROOT` and scales horizontally behind a
load balancer; move attachments to object storage before running more than one
instance.

The database is the constraint. It is indexed for the operational queries — see
`docs/A-DOMAIN-MODEL.md` — and every list endpoint pages server-side. No
endpoint returns an unbounded collection.

## Rollback

```bash
railway rollback --service elbakri-api
```

Application rollback is immediate. **Database rollback is not** — a deployed
migration may have altered the schema, so a rollback across one needs a
considered down-migration or a restore. Prefer additive migrations for this
reason.
