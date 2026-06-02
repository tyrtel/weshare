-- ouiShare initial schema
-- All monetary amounts are stored as integer cents (never floats).

-- ── users ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.users (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text        NOT NULL,
  avatar_url   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── trips ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trips (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  currency     char(3)     NOT NULL,
  owner_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  invite_token text        UNIQUE
);

-- ── trip_members ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trip_members (
  trip_id      uuid        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  display_name text        NOT NULL,
  is_guest     boolean     NOT NULL DEFAULT false,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);

-- ── expenses ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.expenses (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id            uuid        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  description        text        NOT NULL,
  total_amount_cents integer     NOT NULL CHECK (total_amount_cents > 0),
  currency           char(3)     NOT NULL,
  paid_by_user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  metadata           jsonb       NOT NULL DEFAULT '{}'
);

-- ── splits ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.splits (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id         uuid        NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id            uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  amount_owed_cents  integer     NOT NULL CHECK (amount_owed_cents >= 0),
  amount_paid_cents  integer     NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),
  settled_at         timestamptz
);


-- ── RLS: users ────────────────────────────────────────────────────────────────

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users: read own row"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users: insert own row"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users: update own row"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);


-- ── RLS: trips ────────────────────────────────────────────────────────────────
-- (trip_members table must exist before these policies are created)

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trips: members can read"
  ON public.trips FOR SELECT
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = trips.id AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "trips: owner can insert"
  ON public.trips FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "trips: owner can update"
  ON public.trips FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "trips: owner can delete"
  ON public.trips FOR DELETE
  USING (owner_id = auth.uid());


-- ── RLS: trip_members ─────────────────────────────────────────────────────────

ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_members: members can read"
  ON public.trip_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_members.trip_id
        AND (
          t.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.trip_members tm2
            WHERE tm2.trip_id = t.id AND tm2.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "trip_members: owner or self can insert"
  ON public.trip_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_members.trip_id AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "trip_members: owner can delete"
  ON public.trip_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_members.trip_id AND t.owner_id = auth.uid()
    )
  );


-- ── RLS: expenses ─────────────────────────────────────────────────────────────

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses: members can read"
  ON public.expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = expenses.trip_id
        AND (
          t.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.trip_members tm
            WHERE tm.trip_id = t.id AND tm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "expenses: members can insert"
  ON public.expenses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = expenses.trip_id AND tm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = expenses.trip_id AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "expenses: payer or owner can update"
  ON public.expenses FOR UPDATE
  USING (
    paid_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = expenses.trip_id AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "expenses: payer or owner can delete"
  ON public.expenses FOR DELETE
  USING (
    paid_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = expenses.trip_id AND t.owner_id = auth.uid()
    )
  );


-- ── RLS: splits ───────────────────────────────────────────────────────────────

ALTER TABLE public.splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "splits: members can read"
  ON public.splits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      JOIN public.trips t ON t.id = e.trip_id
      WHERE e.id = splits.expense_id
        AND (
          t.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.trip_members tm
            WHERE tm.trip_id = t.id AND tm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "splits: payer can insert"
  ON public.splits FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = splits.expense_id AND e.paid_by_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      JOIN public.trips t ON t.id = e.trip_id
      WHERE e.id = splits.expense_id AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "splits: member can update own split"
  ON public.splits FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "splits: payer or owner can delete"
  ON public.splits FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = splits.expense_id AND e.paid_by_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      JOIN public.trips t ON t.id = e.trip_id
      WHERE e.id = splits.expense_id AND t.owner_id = auth.uid()
    )
  );
