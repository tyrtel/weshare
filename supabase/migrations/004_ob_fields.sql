-- Add Open Banking fields to split_requests
-- Chunk B: Tink / PSD2 SEPA payment initiation

ALTER TABLE split_requests
  ADD COLUMN IF NOT EXISTS ob_payment_id text,
  ADD COLUMN IF NOT EXISTS ob_provider   text;

-- Index for status polling (ob_initiate → ob-status edge function)
CREATE INDEX IF NOT EXISTS idx_split_requests_ob_payment_id
  ON split_requests (ob_payment_id)
  WHERE ob_payment_id IS NOT NULL;

-- Extend the status CHECK constraint to include 'authorized'
-- (bank authorized, SEPA transfer in transit)
ALTER TABLE split_requests
  DROP CONSTRAINT IF EXISTS split_requests_status_check;

ALTER TABLE split_requests
  ADD CONSTRAINT split_requests_status_check
    CHECK (status IN (
      'created',
      'request_sent',
      'authorized',
      'pending',
      'completed',
      'declined',
      'expired'
    ));
