-- 011_trip_status.sql
-- Adds a status column to trips so the settle/close lifecycle can be persisted.
-- Existing rows default to 'active'; the CHECK constraint enforces the three valid states.

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'settling', 'closed'));
