# J — Tabs, Contextual Help, Matching and the Hotel Directory

Covers the four systems added in the upgrade: URL-backed tabs, the contextual
help registry, the matching workflow, and the hotel directory integration with
the ELBAKRI Rate Hub.

---

## 1. Tab architecture

### The problem

Trip Detail kept its active tab in React state. A refresh lost it, a shared link
always opened Overview, and Back left the page entirely instead of undoing the
tab change. The page had also grown to 745 lines with every tab inline.

### URL-backed tabs

The active tab lives in the query string:

```
/trips/:id?tab=hotels
/imports/:id?tab=matching
/travelers/:id?tab=transfers
/master-data/hotels/:id?tab=sync
```

Switching tabs uses `router.push`, not `replace` — switching a tab *is*
navigation, and Back should undo it.

### The registry

Each tab declares itself once, in one file:

```ts
{
  key: 'finance',                          // the URL value; never translated
  label: (t) => t.trips.finance,           // from the dictionary
  icon: Receipt,
  permissions: [PERMISSIONS.FINANCE_READ], // hidden entirely without it
  count: (c) => c.trip.financialDocuments.length,
  helpKey: 'field.outstanding',
  unavailable: (c, t) => …,                // why it is disabled, localised
  content: FinanceTab,
}
```

Registries live in `components/{trips,travelers,imports}/tab-registry.ts`, and
the hotel detail page declares its own inline.

This exists so the tab bar, the permission check, the count and the help text
cannot drift apart across separate files — which is what happens when each is
added where it was needed at the time.

### Permission vs availability

They are different things and are deliberately not conflated:

| | Decides | Effect |
| --- | --- | --- |
| `permissions` | Security | The tab is **not rendered at all** |
| `unavailable()` | Workflow state | The tab renders **disabled, with the reason** |

There are no feature flags on core modules. Hotels, Transfers, Excursions, Visa
and Trip Files work if the user holds the permission. Permission controls
security; it is not a rollout switch.

**A tab that renders and does nothing is never acceptable.** Either it works, it
is hidden, or it says why it cannot be used yet.

### Fallback

An unknown, now-forbidden or disabled tab falls back to the first usable one, so
a stale bookmark or a changed permission still opens a working page. The rule
lives in `packages/shared/src/rules/tab-routing.ts` and is unit tested there —
the component imports it rather than repeating it, so the tested logic is the
used logic.

### Loading

Hooks cannot be conditional, so `useResolvedTabs` runs before the query
resolves. It takes a `ready` flag and skips `count` and `unavailable` until the
record exists; without it they dereference `undefined` and take the page down
with a client-side exception. (This is not hypothetical — it happened, and is
why the flag is there.)

### Splitting

Each tab is its own module:

```
components/trips/tabs/{overview,travelers,hotels,transfers,excursions,
                       visa,finance,attachments,timeline}-tab.tsx
```

The page keeps identity, the header, the registry and routing. Nothing else.

---

## 2. Contextual help

Three levels, one registry (`lib/help-registry.ts`), Arabic and English side by
side. Nothing is written inline in a page, so the same concept is explained the
same way everywhere it appears.

### Level A — field help

A small `?` beside a label opens a short explanation.

```tsx
<HelpTip helpKey="field.outstanding" label={t.finance.outstanding} />
```

Registered for the fields that are genuinely non-obvious: legacy REST, canonical
name, alias, outstanding balance, security approval, match confidence, raw
value, derived travel dates, sync status, external id, nights, visa margin,
pickup time. **Not** for fields like Name.

### Level B — page guide

A `?` in the page header opens a drawer explaining the screen: what it does,
when to use it, the workflow, the rules, an example, and common mistakes.

```tsx
<PageHeader guideKey="page.matching" … />
```

Guides exist for Trip Files, Today's Operations, Hotel Bookings, Transfers,
Excursions, Visas, Finance, Import Center, Matching, Data Quality, Hotels and
Travellers.

A side drawer on desktop, a bottom sheet on phones — and it opens from the
inline-end edge, so in Arabic it comes from the other side rather than fighting
the reading direction.

### Level C — inline notice

For a rule that would otherwise be misread. Used sparingly: a notice on every
screen is a notice nobody reads.

```tsx
<HelpNotice noticeKey="notice.outstandingDerived" />
```

- Import Center — *Every meaningful source row must be accounted for before applying.*
- Matching — *Matching teaches future imports how this spelling should resolve.*
- Finance — *Outstanding is calculated from payment transactions and cannot be typed manually.*
- Hotels — *Hotel details are synchronized from ELBAKRI Rate Hub. Pricing is intentionally not imported into this system.*
- Legacy values — *This is the exact value from the original Excel file and has been preserved for review.*

### Accessibility

Every help control is a real `<button>` in a Radix popover — never a hover
tooltip. Hover is unreachable by keyboard, invisible to screen readers, and does
not exist on a phone. All three levels are focusable, have an `aria-label`,
close on Escape, and work under RTL.

### Disabled controls

A disabled control always carries its reason:

```tsx
<Button disabled={Boolean(reason)}>{t.imports.apply}</Button>
<DisabledReason reason={reason} />
```

*"Apply is unavailable while unresolved blocking errors remain."*
*"You do not have permission to reconcile financial records."*
*"A hotel synchronisation is already running."*

A greyed-out button with no explanation leaves someone unable to tell whether it
is broken, forbidden, or waiting on something they could do.

### Empty states

Every list says what is missing, and offers the next action where the person is
allowed to take it. `"No results"` on its own tells someone nothing.

---

## 3. Matching workflow

### Where it lives

- `/matching` — the queue across every import
- `/imports/:id?tab=matching` — the same component, filtered to one run

### What it shows

Raw value as the workbook wrote it, entity type, occurrence count, the suggested
canonical record with its confidence score, and the current decision.

### The four actions

| Action | Endpoint | Meaning |
| --- | --- | --- |
| Link to suggestion | `POST /alias-suggestions/:id/approve` | Another spelling of an existing record |
| Choose record | same, with a picked target | Searchable picker over the canonical records |
| Create as new | `POST /alias-suggestions/:id/promote` | Genuinely new to the system |
| Reject | `POST /alias-suggestions/:id/reject` | Not an entity — a note, a typo, a stray cell |

The frontend calls the existing backend resolution endpoints. Matching is not
reimplemented in React.

### Why it asks instead of guessing

Only a deterministic match resolves automatically — exact canonical name, or an
approved alias. Similarity only ever *suggests*.

A wrong merge silently moves one company's bookings onto another. A duplicate is
visible and reversible. The asymmetry is deliberate.

Once approved, the alias resolves deterministically on every future import.

### Refresh

A decision invalidates the matching queue, import statistics, data-quality
counts and the master-data lists together. A stale count is how someone ends up
doing the same work twice.

---

## 4. Hotel directory integration

### The boundary

```
elbakri-rate  ──── hotel identity + description ───▶  booking_elbakri
(Rate Hub)         NO pricing, ever                   (Booking OS)
```

The two products stay separate. The Booking OS holds hotel identity and
metadata; rates live in the Rate Hub and are never imported.

### Why a new endpoint

`/api/hotels` in the Rate Hub is built for that application: it carries rate
visibility logic and returns `rates_count`, `ready_count`, `independent_rates`
and `package_rates`. Coupling to it would also mean every change to rate
visibility silently changes what the Booking OS sees.

So `GET /api/integrations/hotels` exists instead, with an explicit allowlist:

`id`, `hotel_name`, `hotel_group_id`, `group_name`, `region`, `sub_region`,
`star_rating`, `address`, `description`, `facilities`, `child_policy_default`,
`transfer_notes_default`, `status`, `updated_at`.

The response is built key by key, and the query names its columns rather than
using `SELECT *`. A column added to `hotels` later must not appear here by
accident.

### Defence on both sides

| Side | Guard | Tests |
| --- | --- | --- |
| Producer | Allowlist + named columns | `api/tests/hotel_directory_test.php` |
| Consumer | Re-derives every field, logs what it dropped | `hotel-directory.client.spec.ts` (11) |

The consumer does not trust the payload. A dropped field whose name looks
financial is logged as an **error**, not a warning — it means the upstream
contract changed in the one direction it must not.

### Authentication

Server-to-server only.

```bash
ELBAKRI_RATE_API_URL=https://rates.example.com
ELBAKRI_RATE_INTEGRATION_KEY=…            # never NEXT_PUBLIC_*
```

The browser never calls the Rate Hub. The key is a dedicated integration
credential, not an employee's 12-hour web JWT: synchronisation runs on a
schedule and must not depend on someone being logged in. Access is audited on
the Rate Hub side.

### Local catalogue

`booking_elbakri` keeps its own synchronised `Hotel` table. Every dropdown reads
that, not a live call upstream. This gives fast pickers, real foreign keys,
stable historical references, local alias matching — and reservations that keep
working when the Rate Hub is unreachable.

### Sync rules

**Deterministic, in order:**

1. external id → update in place
2. exact canonical name → bind
3. approved alias → bind
4. a single close match → **queue for review**, do not link
5. nothing → create

Idempotent: running twice changes nothing the second time.

| Situation | Behaviour |
| --- | --- |
| Upstream rename | Updated in place; the old spelling is kept as an alias |
| Upstream goes inactive | Not offered for new bookings; **never deleted** — existing stays keep their hotel |
| Ambiguous name | A review item, never an automatic merge |
| Name collision | Resolved rather than throwing mid-sync |
| Transfer location | Linked by hotel id, so repeat syncs do not create duplicates |
| Per-hotel failure | Recorded; the run continues |
| Whole sync fails | The last good catalogue keeps serving; a warning shows to administrators |

### Permission

`hotels.sync` is its own permission. Synchronisation is an integration task, not
a reservation agent's job, so it can be granted without master-data management.

### Screens

**Master Data → Hotels** — the directory: group, region, sub-region, stars,
aliases, booking usage, source, sync state, with filters for each. A sync panel
shows the source, last run and counts, and links to whatever needs review.

**`/master-data/hotels/:id`** — Overview, Hotel Details, Aliases & Matching,
Booking Usage, Sync Information.

There is **no Prices, Rates or Packages tab**, and no money appears anywhere in
the Booking OS hotel screens.

---

## 5. Navigation integrity

`scripts/audit-navigation.py` walks every `href` and `router.push` in the web app
and checks it against the routes Next.js actually builds.

```bash
python3 scripts/audit-navigation.py
```

It catches two classes:

- **Broken** — the route does not exist (`/travelers/:id` before it was built).
- **Shadowed** — a literal path swallowed by a dynamic segment. `/trips/new`
  "matched" `/trips/[id]` and rendered a detail page for a record that cannot
  exist. A naive existence check sees a dynamic segment and calls it fine.

Both were real, both are fixed, and the audit runs as a Playwright test so they
cannot come back.

---

## 6. Testing

```bash
npm run test -w @elbakri/shared    # 147 — parsers, rules, tab routing
npm run test -w @elbakri/api       #  23 — directory boundary, hotel sync
npm run test:e2e -w @elbakri/web   # every page renders, tabs, en/ar × desktop/mobile
python3 scripts/audit-navigation.py            # no internal link 404s
API_PASSWORD=… python3 scripts/check-api-contracts.py   # 85 field assertions
php api/tests/hotel_directory_test.php   # in elbakri-rate
```

### Why the contract check exists

`/finance` shipped broken. The page read `partnerBalances`, `overdueAmount` and
`totalBilled`; the endpoint returns `counterpartyBalances`, `overdueOutstanding`
and `totalPayable`. It typechecked perfectly, because the type was a fiction
written alongside the component rather than derived from the server.

TypeScript cannot catch this, and neither can a unit test with a mocked
response — both check the code against the same assumption. Only asking the real
API does.

`scripts/check-api-contracts.py` makes 85 field assertions across 19 endpoints,
plus the hotel pricing boundary from the consumer side. Four more pages were
wrong the same way and were found by running it: Reports, Settings, Audit and
Reconciliation.

Verified in a browser against real data: nine tabs render, `?tab=` survives a
refresh, Back and Forward step through tab history, an invalid tab falls back to
Overview, Arabic renders RTL with the tab deep-link honoured, the page guide
opens and closes with Escape, and the mobile layout has no horizontal overflow.
