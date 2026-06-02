-- Tracks OCR calls per user for rate limiting in the parse-receipt Edge Function.
-- The Edge Function calls check_ocr_rate_limit() which atomically inserts a row
-- and returns whether the caller is within the allowed window.

create table if not exists ocr_rate_limit (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Index for the per-user window query.
create index ocr_rate_limit_user_created on ocr_rate_limit (user_id, created_at desc);

-- RLS: users cannot read or manipulate their own rows directly — only the
-- service-role client (used by the Edge Function) can write here.
alter table ocr_rate_limit enable row level security;

-- Atomically records a call and returns true if the user is within the limit.
-- Called by the Edge Function via the admin (service-role) client.
create or replace function check_ocr_rate_limit(
  p_user_id      uuid,
  p_max_calls    int  default 20,
  p_window_mins  int  default 60
) returns boolean
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  -- Count calls in the rolling window.
  select count(*) into v_count
  from ocr_rate_limit
  where user_id = p_user_id
    and created_at > now() - (p_window_mins || ' minutes')::interval;

  if v_count >= p_max_calls then
    return false;
  end if;

  -- Record this call.
  insert into ocr_rate_limit (user_id) values (p_user_id);
  return true;
end;
$$;
