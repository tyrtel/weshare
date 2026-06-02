-- Invite token generation
-- Generates an 8-character URL-safe token from a restricted alphabet
-- (no ambiguous characters: 0/O, 1/I/l).

CREATE OR REPLACE FUNCTION public.generate_invite_token()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  result   text := '';
  i        integer;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(alphabet, (floor(random() * length(alphabet)))::integer + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Auto-populate invite_token on trip insert if not provided.
CREATE OR REPLACE FUNCTION public.set_invite_token()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invite_token IS NULL THEN
    NEW.invite_token := public.generate_invite_token();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trips_set_invite_token
  BEFORE INSERT ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.set_invite_token();

-- Index for fast invite-link lookups.
CREATE INDEX IF NOT EXISTS idx_trips_invite_token ON public.trips(invite_token);
