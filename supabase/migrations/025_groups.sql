-- Groups and related schema additions
-- Adds: groups table, group_members table, trips.group_id, expenses.group_id,
-- expenses.trip_id nullable, expenses.settled_at

-- ── Groups ────────────────────────────────────────────────────────────────────

CREATE TABLE groups (
  id            text        PRIMARY KEY,
  name          text        NOT NULL,
  currency      text        NOT NULL,
  owner_id      text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  invite_token  text
);

-- Auto-generate invite token on insert (same CSPRNG approach as trips)
CREATE OR REPLACE FUNCTION generate_group_invite_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invite_token IS NULL THEN
    NEW.invite_token := encode(gen_random_bytes(6), 'base64');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER groups_invite_token
  BEFORE INSERT ON groups
  FOR EACH ROW EXECUTE FUNCTION generate_group_invite_token();

-- ── Group members ─────────────────────────────────────────────────────────────

CREATE TABLE group_members (
  group_id      text        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id       text        NOT NULL,
  display_name  text        NOT NULL,
  is_guest      bool        NOT NULL DEFAULT false,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  phone         text,
  email         text,
  avatar_url    text,
  PRIMARY KEY (group_id, user_id)
);

-- ── Extend trips ──────────────────────────────────────────────────────────────

ALTER TABLE trips
  ADD COLUMN group_id text REFERENCES groups(id) ON DELETE SET NULL;

-- ── Extend expenses ───────────────────────────────────────────────────────────

ALTER TABLE expenses
  ALTER COLUMN trip_id DROP NOT NULL,
  ADD COLUMN group_id   text REFERENCES groups(id) ON DELETE CASCADE,
  ADD COLUMN settled_at timestamptz;

-- ── RLS policies ──────────────────────────────────────────────────────────────

ALTER TABLE groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Group owner or member can read
CREATE POLICY "group members can read"
  ON groups FOR SELECT
  USING (
    auth.uid()::text = owner_id
    OR EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = groups.id
        AND gm.user_id = auth.uid()::text
    )
  );

-- Only owner can insert / update / delete
CREATE POLICY "group owner can write"
  ON groups FOR ALL
  USING (auth.uid()::text = owner_id);

CREATE POLICY "group members can read memberships"
  ON group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_members.group_id
        AND (
          g.owner_id = auth.uid()::text
          OR EXISTS (
            SELECT 1 FROM group_members gm2
            WHERE gm2.group_id = g.id AND gm2.user_id = auth.uid()::text
          )
        )
    )
  );

CREATE POLICY "group owner can manage memberships"
  ON group_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_members.group_id
        AND g.owner_id = auth.uid()::text
    )
  );
