-- Tracks PDF report generation calls per user for rate limiting.
-- Mirrors check_ocr_rate_limit() (007_ocr_rate_limit.sql) exactly — same
-- rolling-window, atomic count-then-insert pattern, just a different table
-- and default limit (5 reports per rolling 24h, vs OCR's 20/hour).

create table if not exists report_rate_limit (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index report_rate_limit_user_created on report_rate_limit (user_id, created_at desc);

-- RLS: users cannot read or manipulate their own rows directly — only the
-- SECURITY DEFINER function below (called via the authenticated client) may
-- write here.
alter table report_rate_limit enable row level security;

-- Atomically records a call and returns whether the user is within the
-- limit, plus how many calls remain — the client shows this in the UI
-- ("X of 5 reports remaining today"), which check_ocr_rate_limit doesn't
-- need since it has no equivalent UI-facing counter.
--
-- Unlike check_ocr_rate_limit (only ever called by the trusted service-role
-- parse-receipt Edge Function, so a p_user_id parameter is safe there), this
-- RPC is called directly by the authenticated client — there is no
-- server-side processing step for report generation to hide behind. Taking
-- a user id as a parameter would let a caller spoof or spam another user's
-- rate limit, so the caller's own identity is always resolved from
-- auth.uid(), never accepted as input — same reasoning as
-- merge_guest_records_for_new_user (033) and claim_group_member_slot (032).
create or replace function check_report_rate_limit(
  p_max_calls    int default 5,
  p_window_mins  int default 1440
) returns table (allowed boolean, remaining int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count   int;
begin
  if v_user_id is null then
    return query select false, 0;
    return;
  end if;

  select count(*) into v_count
  from report_rate_limit
  where user_id = v_user_id
    and created_at > now() - (p_window_mins || ' minutes')::interval;

  if v_count >= p_max_calls then
    return query select false, 0;
    return;
  end if;

  insert into report_rate_limit (user_id) values (v_user_id);
  return query select true, (p_max_calls - v_count - 1);
end;
$$;

revoke all on function check_report_rate_limit(int, int) from public;
grant execute on function check_report_rate_limit(int, int) to authenticated;
