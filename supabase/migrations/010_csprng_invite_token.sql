-- SEC-8: Replace Mersenne Twister random() with a CSPRNG for invite token generation.
--
-- The alphabet has 54 characters. 256 % 54 = 40, so naïve modulo would favour the
-- first 40 characters slightly more. Rejection sampling discards bytes >= 216
-- (i.e. the 40 values that introduce bias) and re-draws — each character needs
-- ~1.19 draws on average, so the loop terminates very quickly in practice.

CREATE OR REPLACE FUNCTION public.generate_invite_token()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet  text    := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  alpha_len integer := length(alphabet);   -- 54
  threshold integer := 256 - (256 % alpha_len);  -- 216
  result    text    := '';
  rand_byte integer;
BEGIN
  WHILE length(result) < 8 LOOP
    rand_byte := get_byte(gen_random_bytes(1), 0);
    IF rand_byte < threshold THEN
      result := result || substr(alphabet, (rand_byte % alpha_len) + 1, 1);
    END IF;
  END LOOP;
  RETURN result;
END;
$$;
