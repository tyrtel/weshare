-- Migration 045: append-only activity log backing the History feed.
--
-- Distinct from audit_log (014_audit_log.sql), which is a narrow Stripe/Tink
-- settlement audit trail written by Edge Functions. activity_events is a
-- general-purpose event log written by the client app itself whenever a
-- user creates/edits/deletes an expense, records a payment, or changes
-- group/trip/membership state.
--
-- group_id / trip_id / expense_id are carried on every row (not just the
-- entity's own id in entity_id) so a feed row can render the full
-- group -> trip -> expense breadcrumb and each segment can still link out
-- after the child entity itself is edited or deleted later.

create table activity_events (
  id             uuid        primary key,
  event_type     text        not null,                    -- e.g. 'expense.created'
  entity_type    text        not null check (entity_type in ('expense', 'group', 'trip', 'member')),
  entity_id      text        not null,
  group_id       text        references groups(id) on delete cascade,
  trip_id        uuid        references trips(id) on delete cascade,
  expense_id     uuid        references expenses(id) on delete cascade,
  actor_user_id  uuid        not null references users(id) on delete restrict,
  payload        jsonb,
  created_at     timestamptz not null default now()
);

create index activity_events_group_idx  on activity_events (group_id, created_at desc) where group_id is not null;
create index activity_events_trip_idx   on activity_events (trip_id, created_at desc)  where trip_id is not null;
create index activity_events_expense_idx on activity_events (expense_id, created_at desc) where expense_id is not null;

-- The global History feed's "every group/trip this user belongs to, merged
-- and sorted" query (IActivityLogRepository.getEventsForUser) is a single
-- `where group_id in (...) or trip_id in (...) order by created_at desc
-- limit N` — Postgres answers that from these same two indexes (one scan
-- per matching id, merged) rather than the client fetching per-group/
-- per-trip pages and merging in JS.

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Reuses is_group_member() (026_fix_group_rls.sql) and is_trip_member()
-- (027_trip_members_user_id_text.sql) rather than fresh EXISTS subqueries —
-- both helpers already exist for exactly this check.

alter table activity_events enable row level security;

create policy "members can read activity for their group or trip"
  on activity_events for select
  using (
    (group_id is not null and is_group_member(group_id))
    or (trip_id is not null and is_trip_member(trip_id))
  );

-- Append-only: the actor must be the authenticated user, and must currently
-- be a member of the group/trip the event is scoped to. No update/delete
-- policy exists, so rows are immutable once RLS is enabled.
create policy "members can append activity for their group or trip"
  on activity_events for insert
  with check (
    actor_user_id = auth.uid()
    and (group_id is null or is_group_member(group_id))
    and (trip_id is null or is_trip_member(trip_id))
  );
