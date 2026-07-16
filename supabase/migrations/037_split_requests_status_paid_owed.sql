-- Migration 037: split_requests_status_check never allowed 'paid' or 'owed'.
--
-- Found while functionally verifying migration 035's trigger: inserting a row
-- with status = 'paid' — exactly what createManualPaymentRequest()
-- (src/core/models/SplitRequest.ts:63, the "Record Payment" primitive behind
-- useSettlement/useGroupDetail/useSettleAllGroupDebts) has always done — is
-- rejected outright by the CHECK constraint. It was last redefined in
-- 004_ob_fields.sql to add 'authorized' and has never been touched since,
-- even though the application's SplitRequestStatus type has included 'owed'
-- and 'paid' since before this migration series started (rollover.ts's
-- useRollover.ts:170 also inserts 'owed' directly).
--
-- Net effect until this fix: every manual "Record Payment" action and the
-- rollover flow's 'owed' bootstrap row have been rejected by Postgres in any
-- real deployment — both have only ever been exercised against the
-- in-memory test repo, never real Postgres. This also means migration 035's
-- trigger INSERT branch for 'paid' (its stated primary use case, see that
-- file's own header) could never fire until now.

ALTER TABLE split_requests
  DROP CONSTRAINT IF EXISTS split_requests_status_check;

ALTER TABLE split_requests
  ADD CONSTRAINT split_requests_status_check
    CHECK (status IN (
      'owed',
      'paid',
      'created',
      'request_sent',
      'authorized',
      'pending',
      'completed',
      'declined',
      'expired'
    ));
