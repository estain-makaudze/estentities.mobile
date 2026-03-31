-- ============================================================
-- Family Expenses — Initial Supabase Schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
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
