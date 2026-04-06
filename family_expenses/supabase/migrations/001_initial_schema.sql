-- ============================================================
-- Family Expenses — Initial Supabase Schema  (v2 — includes RPCs)
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
--
-- HOW TO RUN:
--   1. Go to https://supabase.com/dashboard/project/<your-project-id>
--   2. Click "SQL Editor" in the left sidebar
--   3. Paste this entire file and click "Run"
--   4. You should see "Success. No rows returned" for each statement
-- ============================================================

-- ----------------------------------------------------------
-- 1. profiles
--    Public display info for each auth user (name, color).
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  name      TEXT NOT NULL DEFAULT '',
  color     TEXT NOT NULL DEFAULT '#4A90D9',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Automatically create a profile row when a new user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, color)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'color', '#4A90D9')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------
-- 2. households
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.households (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------
-- 3. household_members
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.household_members (
  household_id UUID NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

-- ----------------------------------------------------------
-- 4. expenses
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  paid_by      UUID NOT NULL REFERENCES auth.users (id),
  amount       NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description  TEXT NOT NULL DEFAULT '',
  date         DATE NOT NULL,
  category     TEXT NOT NULL DEFAULT 'Other',
  note         TEXT,
  -- split_ratio: null means payer owns 100%.
  -- Otherwise: [{ "userId": "<uuid>", "percentage": <number> }, ...]
  split_ratio  JSONB,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------
-- 5. settlements
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users (id),
  to_user_id   UUID NOT NULL REFERENCES auth.users (id),
  amount       NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  date         DATE NOT NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements       ENABLE ROW LEVEL SECURITY;

-- Helper: check household membership
-- (used in all policies below)
CREATE OR REPLACE FUNCTION public.is_household_member(hid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = hid AND user_id = auth.uid()
  );
$$;

-- profiles: users can read all profiles (needed to show member names),
--           but only update their own.
CREATE POLICY "profiles: public read"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "profiles: own write"
  ON public.profiles FOR ALL
  USING (id = auth.uid());

-- households: members can read; any authenticated user can insert (create).
CREATE POLICY "households: member read"
  ON public.households FOR SELECT
  USING (public.is_household_member(id));

CREATE POLICY "households: authenticated insert"
  ON public.households FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- household_members: members can see the roster; authenticated users can
--                    insert themselves (join via invite code).
CREATE POLICY "household_members: member read"
  ON public.household_members FOR SELECT
  USING (public.is_household_member(household_id));

CREATE POLICY "household_members: self insert"
  ON public.household_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- expenses: full access for household members only.
CREATE POLICY "expenses: household members only"
  ON public.expenses FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- settlements: full access for household members only.
CREATE POLICY "settlements: household members only"
  ON public.settlements FOR ALL
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- ============================================================
-- Enable Realtime on tables that need live sync
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.settlements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.household_members;

-- ============================================================
-- RPC helper functions (SECURITY DEFINER = bypass RLS)
--
-- WHY these are needed:
--   The RLS on `households` only lets you SELECT rows you are
--   already a member of.  That creates a chicken-and-egg problem:
--     • create_household — you must INSERT the household *and*
--       INSERT yourself as a member in one go before any SELECT.
--     • join_household_by_code — you must READ the household
--       (to get its id) before you can INSERT yourself as a member.
--
--   Both operations are impossible with plain table access from
--   the client.  Running them as SECURITY DEFINER functions on the
--   server side lets Postgres act as superuser for just those two
--   operations, while everything else stays behind RLS.
-- ============================================================

-- ----------------------------------------------------------
-- create_household(household_name TEXT) → JSONB
--   Generates a unique invite code, creates the household row,
--   and immediately adds the calling user as the first member.
--   Returns { id, name, invite_code } on success.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_household(household_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite_code TEXT;
  v_household_id UUID;
  v_attempts    INT := 0;
  chars         TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code          TEXT;
  i             INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF trim(household_name) = '' THEN
    RAISE EXCEPTION 'Household name cannot be blank';
  END IF;

  -- Generate a unique 8-character invite code.
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (SELECT 1 FROM households WHERE invite_code = code);

    v_attempts := v_attempts + 1;
    IF v_attempts >= 10 THEN
      RAISE EXCEPTION 'Could not generate a unique invite code — please try again';
    END IF;
  END LOOP;

  v_invite_code := code;

  -- Create the household.
  INSERT INTO households (name, invite_code)
  VALUES (trim(household_name), v_invite_code)
  RETURNING id INTO v_household_id;

  -- Add the creator as the first member.
  INSERT INTO household_members (household_id, user_id)
  VALUES (v_household_id, auth.uid());

  RETURN jsonb_build_object(
    'id',          v_household_id,
    'name',        trim(household_name),
    'invite_code', v_invite_code
  );
END;
$$;

-- ----------------------------------------------------------
-- join_household_by_code(p_invite_code TEXT) → JSONB
--   Looks up the household by invite code (bypassing RLS),
--   then inserts the calling user as a member.
--   Returns { id, name, invite_code, already_member } on success,
--   or { error: '...' } when the code is invalid.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_household_by_code(p_invite_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_hh households%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find the household ignoring RLS (SECURITY DEFINER).
  SELECT * INTO v_hh
  FROM households
  WHERE invite_code = upper(trim(p_invite_code));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid invite code. Please check and try again.');
  END IF;

  -- Already a member?
  IF EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = v_hh.id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object(
      'id',            v_hh.id,
      'name',          v_hh.name,
      'invite_code',   v_hh.invite_code,
      'already_member', true
    );
  END IF;

  -- Join the household.
  INSERT INTO household_members (household_id, user_id)
  VALUES (v_hh.id, auth.uid());

  RETURN jsonb_build_object(
    'id',            v_hh.id,
    'name',          v_hh.name,
    'invite_code',   v_hh.invite_code,
    'already_member', false
  );
END;
$$;

-- ----------------------------------------------------------
-- Grant execute to authenticated users
-- ----------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.create_household(TEXT)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_household_by_code(TEXT)    TO authenticated;

-- ============================================================
-- Force PostgREST to reload its schema cache immediately.
-- Without this you may get "table not found in schema cache"
-- errors for a few seconds after running the migration.
-- ============================================================
NOTIFY pgrst, 'reload schema';


