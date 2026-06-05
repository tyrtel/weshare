-- Migration 014: append-only audit log for payment status transitions.
-- Inserted by Edge Functions (stripe-webhook, ob-webhook) after each status
-- update. Fire-and-forget — failure must not fail the webhook response.

create table if not exists audit_log (
  id          uuid        primary key default gen_random_uuid(),
  entity_type text        not null,               -- 'split_request'
  entity_id   text        not null,               -- split_request.id
  event_type  text        not null,               -- e.g. 'stripe.checkout.completed'
  payload     jsonb,                              -- redacted webhook data (no PII)
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_entity_idx on audit_log (entity_id, created_at desc);

-- RLS: only authenticated users can read events for split_requests they own.
-- Writes are service-role only (Edge Functions use the admin client).
alter table audit_log enable row level security;

create policy "Users can read audit events for their split requests"
  on audit_log for select
  using (
    exists (
      select 1 from split_requests sr
      where sr.id::text = audit_log.entity_id
        and (sr.payer_user_id = auth.uid() or sr.requester_user_id = auth.uid())
    )
  );
