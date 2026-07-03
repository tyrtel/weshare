# Post-V1 Backlog

Items that are deliberately deferred past the initial release. None of these are blockers for v1 but each carries real risk or cost if left unaddressed long-term.

---

## Quick List

- [ ] Rotate Sentry auth token; move all build secrets to EAS Secrets
- [ ] Evaluate and migrate to a dedicated transactional email provider
- [ ] Audit Supabase plan limits; evaluate moving Postgres to a managed host (AWS RDS / Render)

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
