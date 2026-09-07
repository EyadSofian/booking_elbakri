# G — Roles and Permissions

Access is decided by **permission**, never by role name. Roles are editable
bundles; no code path checks `if (role === 'ADMIN')`.

That matters because the company's structure will change. A new coordinator
role, or one person who needs finance read access without the rest of it, is a
configuration change — not a code change and a deployment.

---

## How a request is authorised

```
Request
  │
  ├─ ThrottlerGuard      rate limit
  ├─ JwtAuthGuard        verify token, confirm the session is live,
  │                      rebuild the permission set from the database
  └─ PermissionsGuard    compare against @RequirePermissions on the handler
```

**Permissions are recomputed on every request**, not read from the token. A
token cannot outlive the access it was issued with: revoking a role takes effect
on the user's next request rather than in fifteen minutes.

The session is also checked on every request, so signing someone out of every
device works immediately.

```
effective = ∪(role permissions) ∪ (granted overrides) ∖ (revoked overrides)
```

---

## Where it is enforced

**On the server, in `PermissionsGuard`.** That is the rule.

The web app also hides controls a user cannot use — but that is a courtesy, not
a boundary. Every endpoint is guarded independently, so a request made outside
the UI is checked exactly the same way.

Two places go further than hiding:

- **Visa amounts** (`netAmount`, `sellAmount`, and the derived margin) are
  stripped from API responses for users without `visas.finance.read`. They are
  never sent, not merely not displayed.
- **The command palette** filters results by the caller's permissions, so it
  cannot become a way to discover records someone is not allowed to open.

---

## Permission catalogue

Defined in `packages/shared/src/domain/permissions.ts`. 48 permissions.

| Group | Permissions |
| --- | --- |
| Trips | `trips.read`, `trips.create`, `trips.update`, `trips.cancel` |
| Travellers | `travelers.read`, `travelers.create`, `travelers.update`, `travelers.merge` |
| Hotels | `hotels.read`, `hotels.create`, `hotels.update`, `hotels.cancel` |
| Transfers | `transfers.read`, `transfers.create`, `transfers.update`, `transfers.assign`, `transfers.status.update` |
| Excursions | `excursions.read`, `excursions.create`, `excursions.update` |
| Visas | `visas.read`, `visas.create`, `visas.update`, `visas.finance.read` |
| Finance | `finance.read`, `finance.documents.manage`, `finance.payments.create`, `finance.payments.reverse`, `finance.reconcile` |
| Imports | `imports.upload`, `imports.review`, `imports.apply` |
| Data quality | `data_quality.read`, `data_quality.resolve` |
| Master data | `master_data.read`, `master_data.manage` |
| Administration | `users.read`, `users.create`, `users.manage`, `roles.manage`, `audit.read`, `api_keys.create`, `api_keys.manage`, `settings.manage` |
| Other | `reports.export`, `attachments.read`, `attachments.upload`, `notifications.read` |

### Permissions that are deliberately separate

`visas.finance.read` is split from `visas.read` so a visa agent can process
applications without seeing margins.

`transfers.assign` and `transfers.status.update` are split from
`transfers.update` so a dispatcher can run the day's board without being able to
edit booking details.

`finance.payments.reverse` is split from `finance.payments.create` because
reversing rewrites the meaning of an existing entry; recording a payment does
not.

`imports.apply` is split from `imports.upload` and `imports.review` so anyone
can bring a workbook in for inspection while committing it stays deliberate.

---

## Seeded roles

Starting bundles. Administrators may edit them.

| Role | Access |
| --- | --- |
| `SUPER_ADMIN` | Everything, including roles and API keys |
| `ADMIN` | Everything except `api_keys.manage` |
| `OPERATIONS_MANAGER` | All operations, master data, imports, data quality, finance read |
| `RESERVATION_AGENT` | Trips, travellers, hotel bookings, export |
| `TRANSFER_COORDINATOR` | Transfers including assignment and dispatch |
| `EXCURSION_COORDINATOR` | Excursions |
| `VISA_AGENT` | Visas including their finance figures |
| `FINANCE` | Payables, payments, reversals, reconciliation, data quality |
| `VIEWER` | Read-only across operations |

Each role also carries the read-only baseline (trips, travellers, hotels,
transfers, excursions, visas, master data, notifications) so anyone can see the
operational context for their own work.

---

## Per-user overrides

`UserPermissionOverride` grants or revokes one permission for one person,
without inventing a role for them. Each override records who set it and why.

Real cases: a reservation agent who also handles one agency's payments; a
coordinator temporarily denied export while an audit is under way.

---

## Protections

| Protection | Behaviour |
| --- | --- |
| Self-escalation | Nobody may change their own roles or permissions — `CANNOT_MODIFY_OWN_ACCESS` |
| Last Super Admin | Cannot be demoted or deactivated — `LAST_SUPER_ADMIN` |
| Super Admin role | Always holds every permission; cannot be narrowed |
| Deactivation | Revokes every session immediately |
| Password change | Revokes every other session |
| Admin password reset | Revokes every session |
| Refresh token replay | Revokes every session for that user |

**Why self-escalation is blocked:** without it, `users.manage` silently implies
every other permission, since a holder could simply grant themselves the rest.
Splitting administrative duties would be meaningless.

**Why the last Super Admin is protected:** removing it locks the organisation
out of its own system with no recovery path short of database surgery.

---

## API keys

For future integrations — a website, a chatbot, an accounting bridge.

Scopes are **read-only by construction**: `trips:read`, `operations:read`,
`hotels:read`, `transfers:read`, `excursions:read`, `visas:read`.

Each scope maps to a set of read permissions, and `finance.read` and
`visas.finance.read` are explicitly stripped afterwards — so no combination of
scopes exposes financial or administrative data, whatever is requested.

Keys are presented as `Authorization: ApiKey <token>` and only reach endpoints
marked `@AllowApiKey()`. The plaintext is shown once and only its Argon2 hash is
stored, so a database leak cannot be turned into working credentials.

---

## Authentication

| Aspect | Choice |
| --- | --- |
| Password hashing | Argon2id, 19 MiB memory, 2 iterations |
| Access token | JWT, 15 minutes |
| Refresh token | Opaque random, hashed in the database, rotated on use |
| Session | A row per device; revocable individually or in bulk |
| Sign-in rate limit | 10 attempts per minute |
| Minimum password | 12 characters |

Sign-in runs a hash verification even when the account does not exist, so the
endpoint does not confirm which email addresses are registered by responding
faster to one than the other.

Refresh tokens are single-use. Presenting one that does not match a live session
revokes every session for that user — a mismatch on a live session means the
token was replayed.

---

## Audit

Every material mutation writes an `AuditLog` entry: actor, action, entity,
before/after snapshots of the changed fields only, request id, IP and user
agent.

Password hashes, refresh tokens, API key hashes and passport numbers are
redacted from snapshots.

Access changes are audited specifically: `USER_ROLE_CHANGED`,
`USER_PERMISSION_OVERRIDE_CHANGED`, `ROLE_PERMISSIONS_CHANGED`,
`USER_PASSWORD_RESET`, `USER_SESSIONS_REVOKED`, `API_KEY_CREATED`,
`API_KEY_REVOKED`.

A failure to write an audit entry is logged loudly but does not fail the
operation it describes — losing the booking would be worse than losing the log
line, and the log line records that it happened.
