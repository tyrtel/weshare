-- Tracks which trip a SplitRequest was rolled over from.
-- NULL for requests that were created directly in the trip.

ALTER TABLE split_requests
  ADD COLUMN IF NOT EXISTS rolled_over_from_trip_id UUID REFERENCES trips(id) ON DELETE SET NULL;
