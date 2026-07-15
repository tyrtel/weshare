# Post-V1 Backlog

Items that are deliberately deferred past the initial release. None of these are blockers for v1 but each carries real risk or cost if left unaddressed long-term.

---

## Quick List

- [ ] Rotate Sentry auth token; move all build secrets to EAS Secrets
- [ ] Evaluate and migrate to a dedicated transactional email provider
- [ ] Audit Supabase plan limits; evaluate moving Postgres to a managed host (AWS RDS / Render)
- [ ] Simulation-mode group scenario fixture ("Chatalains")
- [ ] Screen to view a group's existing recurring expenses

---

## Product Backlog

Smaller, unscheduled feature/dev-tooling items — not infra risk, just not part of any
currently-active phase. Added here rather than into `implementation-todo.md` since
that file tracks one specific, actively-being-executed plan (currently the trip/group
unification + ledger work) and these aren't part of it.

### Simulation-Mode Group Scenario Fixture ("Chatalains")

**Current state**

`src/core/di/simulationContainer.ts` seeds trip data from three scenario fixtures
(`restaurantScenario`, `twoPersonScenario`, `settlingScenario`, all in
`src/__mocks__/fixtures/`), merged via `mergeFixtures()`. **Groups have zero seed
data today** — `GROUP_REPO` and `RECURRING_EXPENSE_REPO` are both registered with a
blank `InMemory*Repository()` in `_create()`, so every group-related screen is
unexplorable in simulation mode without manually creating a group by hand first.

**What to build**

A new fixture, e.g. `src/__mocks__/fixtures/chatalainsScenario.ts`, following the
existing scenario-file pattern:
- A group named "Chatalains" with three members: the simulation's signed-in user
  (`RESTAURANT_CURRENT_USER`), Arnaud, and Carrie.
- Two direct group expenses, **one of which is a spawned instance of a recurring
  expense** (so both `RecurringExpense` + at least one spawned `Expense` referencing
  it exist).
- A trip named "Lille" under the group (`Trip.groupId` set), with a couple of its
  own expenses.

**Why this needs its own work item, not just a fixture file drop-in**

`StorageFixtures` (`src/__mocks__/fixtures/types.ts`) only has fields for
trip-scoped data today (`trips`, `members`, `expenses`, `splits`,
`splitRequests`) — no `groups`, `groupMembers`, `groupExpenses`, or
`recurringExpenses`. `mergeFixtures()` in `simulationContainer.ts` only merges
those same five arrays. Both need extending before a group scenario can be
merged in the same way trip scenarios are today; `_create()` also needs to
actually seed `groupRepo`/`RECURRING_EXPENSE_REPO` from the merged result,
which it currently never does for any scenario.

### View a Group's Existing Recurring Expenses

**Current state**

Recurring-expense CRUD is fully built on the data/hook side —
`useCreateRecurringExpense`, `useEditRecurringExpense`, `usePauseRecurringExpense`,
`useDeleteRecurringExpense`, and **`useRecurringExpenses` (a list-fetching hook)**
all exist in `src/features/groups/hooks/`. `MakeRecurringSheet` is the
promote-an-expense-to-recurring creation UI, reachable from group expense detail.

**The gap:** `useRecurringExpenses` — the hook that already fetches a group's full
recurring-expense list — has **no screen consuming it**. There is currently no way
to see what recurring expenses exist for a group, pause/resume them, or delete one,
short of finding a spawned instance and working backwards.

**What to build**

A screen (e.g. `app/group/recurring/[groupId].tsx`, or a section on an existing
group screen) listing the group's recurring expenses via `useRecurringExpenses`,
each row showing description, amount, period, and pause state, with actions wired
to the edit/pause/delete hooks that already exist. Reachable from group detail —
e.g. a "Recurring" entry point near where `MakeRecurringSheet` is triggered from
today.

---

## Sentry Auth Token — Rotate and Move to EAS Secrets

**Why this matters**

The Sentry auth token (`SENTRY_AUTH_TOKEN`) is currently stored in `.env.local`. That file is gitignored, so it will not be committed. However, keeping a production-scoped secret in a local file creates several exposure paths:

- If the dev machine is compromised (malware, physical access, cloud sync), the token leaks.
- If `.env.local` is ever accidentally included in a Docker build context or copied to another environment, the token travels with it.
- There is no audit trail for who has used the token or when.

The token grants write access to the Sentry project: it can upload source maps, delete releases, modify alert rules, and read all captured error payloads (which may contain user data or stack frames with sensitive values).

**What to do**

1. Invalidate the current token immediately at sentry.io → Settings → Auth Tokens.
2. Generate a new token scoped only to `project:releases` and `project:write` (the minimum required for source map uploads during CI builds).
3. Store the new token as an EAS Secret so it is injected at build time and never touches the local filesystem:

```
eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <new-token>
```

4. Remove `SENTRY_AUTH_TOKEN` from `.env.local` and `.env.example` (if present). Verify no other `.env*` file in the repo contains it.
5. Add a pre-commit hook or CI secret-scanning step (e.g. `gitleaks`, Doppler, or GitHub secret scanning) to catch any future accidental commits of tokens.

---

## Transactional Email — Evaluate and Migrate

**Current state**

Outgoing emails (account invites, notification emails) go through Resend. Resend is a solid developer-friendly service, but it is built on shared infrastructure and the free / early-paid tiers have low daily send caps.

**Why to revisit**

- **Deliverability at scale.** Shared sending IPs mean your domain reputation is partly at the mercy of other Resend senders. At volume, dedicated IPs or a provider with stronger deliverability tooling matter.
- **Cost.** Resend's pricing scales steeply once notification volume grows. AWS SES costs roughly $0.10 per 1,000 emails with no monthly minimum — orders of magnitude cheaper once past the free tier.
- **Compliance.** If the user base expands to include EU residents at any meaningful scale, you will want a provider with a DPA (Data Processing Agreement) and the ability to configure data residency. Verify Resend's current DPA coverage if this applies.
- **Feature needs.** Transactional receipts, debt-owed reminders, and settlement confirmations are different in tone and timing from marketing email. A provider with strong template management (Postmark, Loops, or self-hosted MJML + SES) makes these easier to maintain.

**Options to evaluate**

| Provider | Best for | Notes |
|----------|----------|-------|
| AWS SES | Cost at scale | Cheapest per-message; requires manual domain setup and bounce handling |
| Postmark | Deliverability + transactional focus | Strong reputation; built-in bounce/complaint handling |
| Loops | Product emails (onboarding flows) | Good fit if we add drip sequences |
| Self-hosted (Postal / Haraka + SES relay) | Full control | High ops overhead; only worth it at very large volume |

**Migration path**

Resend sends go through a single Supabase Edge Function (`send-queued-notification`). Swapping providers means updating that function and the `RESEND_API_KEY` / sender-address env vars — no client-side changes required.

---

## Postgres / Supabase Plan — Audit Limits and Evaluate Hosting

**Current state**

The database runs on Supabase's hosted Postgres. Supabase is an excellent fit for early-stage development: instant auth, RLS, Edge Functions, and storage in one place. However, the free and Pro tiers have constraints worth revisiting before scale.

**Known Supabase free / Pro tier limitations to audit**

- **Database size.** Free tier pauses the project after inactivity and caps storage at 500 MB. Pro is 8 GB; beyond that it's pay-per-GB.
- **Row-level security performance.** RLS policies with sub-selects (e.g. `is_group_member()`) add per-row overhead. At high read volume this becomes measurable. Paid tiers allow read replicas and PgBouncer connection pooling.
- **pg_cron.** Already in use for the notification queue worker. The cron extension is available on Pro and above; verify it is not silently disabled on the current plan.
- **`pg_net` / `net.http_post`.** Used by `process_notification_queue` to call Edge Functions. This extension requires Pro or above. Confirm it is enabled in the Supabase dashboard.
- **Connection limits.** Free: 60 direct connections. Pro: 200. Heavy concurrent use (mobile app with many users + pg_cron) can exhaust connections quickly without PgBouncer.
- **Backups.** Free tier: no PITR (point-in-time recovery). Pro: 7-day PITR. For a financial app tracking real money splits this matters.

**When to consider moving off Supabase Postgres**

Supabase itself is just Postgres with managed tooling on top. The auth, RLS, and Edge Functions layers are all decoupled enough that moving the database does not require a full rewrite. Reasons to move:

- Supabase Pro cost vs. AWS RDS equivalent becomes unfavorable above ~50 GB or sustained high-connection workloads.
- You need Postgres extensions not available on Supabase (e.g. `timescaledb`, `pg_partman`).
- Compliance requirements mandate a specific cloud region or certifications (SOC 2, ISO 27001) that Supabase does not yet cover for your tier.

**AWS RDS / Aurora Serverless as an alternative**

AWS RDS Postgres and Aurora Serverless v2 are the obvious candidates. Aurora Serverless scales to zero when idle (good for early-stage cost) and to very high concurrency (good for later). The trade-off: you lose the Supabase dashboard conveniences and would need to self-manage auth (or keep Supabase Auth pointed at an external DB) and migrate Edge Functions to Lambda or another runtime.

**Recommended action**

Before deciding anything:

1. Export current Supabase usage metrics (storage, connections, cron job history) from the dashboard.
2. Identify which Postgres extensions are in active use (`pg_net`, `pg_cron`, `pgcrypto`, `uuid-ossp`) and verify their availability on any candidate host.
3. Price out Supabase Pro vs. RDS `db.t4g.medium` + Aurora Serverless for the projected 12-month load.
4. Only migrate if the cost or feature gap is material — the operational overhead of self-managed Postgres is real.
