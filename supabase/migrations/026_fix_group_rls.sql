-- Fix: infinite recursion in group_members RLS policies
--
-- Root cause: the groups SELECT policy queries group_members to check membership,
-- and the group_members SELECT policy queries groups to check ownership.
-- Postgres evaluates each policy by triggering the other → infinite recursion.
--
-- Fix: a SECURITY DEFINER function checks membership without activating RLS,
-- breaking the cycle. Both affected policies are dropped and recreated.

CREATE OR REPLACE FUNCTION is_group_member(gid text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = gid
      AND user_id  = auth.uid()::text
  );
$$;

-- Drop the mutually-recursive policies
DROP POLICY IF EXISTS "group members can read"             ON groups;
DROP POLICY IF EXISTS "group members can read memberships" ON group_members;

-- Recreate: groups readable by owner or any member (no recursion — uses helper)
CREATE POLICY "group members can read"
  ON groups FOR SELECT
  USING (
    auth.uid()::text = owner_id
    OR is_group_member(id)
  );

-- Recreate: memberships readable by any member of the same group, or by the owner
-- is_group_member() is SECURITY DEFINER so it does not re-trigger this policy
CREATE POLICY "group members can read memberships"
  ON group_members FOR SELECT
  USING (
    is_group_member(group_id)
    OR EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id       = group_members.group_id
        AND g.owner_id = auth.uid()::text
    )
  );
