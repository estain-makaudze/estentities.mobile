-- Family Expenses sync API — initial schema
--
-- Sync model: every synced row carries `rev`, stamped from the global sequence
-- `rev_seq` by trigger on every INSERT/UPDATE. Clients pull `rev > cursor`.
-- Writers take pg_advisory_xact_lock(REV_LOCK) so revs become visible in order
-- (no row can commit with a lower rev after a client has read a higher one).
-- Deletes are soft (`deleted_at`) so tombstones propagate to offline devices.

CREATE SEQUENCE IF NOT EXISTS rev_seq;

CREATE OR REPLACE FUNCTION stamp_rev() RETURNS trigger AS $$
BEGIN
  NEW.rev := nextval('rev_seq');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Identity ────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text UNIQUE,                -- E.164; NULL only for unclaimed imported users
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#2B3BE0',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  rev         bigint NOT NULL DEFAULT 0
);

CREATE TABLE devices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,       -- sha256(token), token itself never stored
  name        text NOT NULL DEFAULT 'Phone',
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);
CREATE INDEX devices_user_idx ON devices(user_id);

-- ── Households ──────────────────────────────────────────────────────────────

CREATE TABLE households (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  invite_code  text NOT NULL UNIQUE,
  currency     text NOT NULL DEFAULT 'USD',
  owner_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  rev          bigint NOT NULL DEFAULT 0
);

CREATE TABLE household_members (
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,                -- set when the member leaves
  rev          bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (household_id, user_id)
);
CREATE INDEX household_members_user_idx ON household_members(user_id);

-- ── Synced household data (client-generated UUIDs, last-write-wins) ────────

CREATE TABLE categories (
  id                uuid PRIMARY KEY,
  household_id      uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name              text NOT NULL,
  emoji             text NOT NULL DEFAULT '📦',
  color             text,
  default_splits    jsonb,                 -- SplitEntry[] | null
  sort_order        int NOT NULL DEFAULT 0,
  client_updated_at timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  rev               bigint NOT NULL DEFAULT 0
);

CREATE TABLE expenses (
  id                uuid PRIMARY KEY,
  household_id      uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  paid_by           uuid NOT NULL REFERENCES users(id),
  created_by        uuid REFERENCES users(id),
  amount            numeric(12, 2) NOT NULL CHECK (amount > 0),
  date              date NOT NULL,
  description       text NOT NULL,
  category_id       uuid,                  -- soft reference; category may be deleted
  note              text,
  splits            jsonb,                 -- SplitEntry[] | null (null = payer owns 100%)
  recurring_id      uuid,
  client_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  rev               bigint NOT NULL DEFAULT 0
);

CREATE TABLE settlements (
  id                uuid PRIMARY KEY,
  household_id      uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  from_user_id      uuid NOT NULL REFERENCES users(id),
  to_user_id        uuid NOT NULL REFERENCES users(id),
  amount            numeric(12, 2) NOT NULL CHECK (amount > 0),
  date              date NOT NULL,
  note              text,
  created_by        uuid REFERENCES users(id),
  client_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  rev               bigint NOT NULL DEFAULT 0
);

-- One monthly budget per (household, category); category_id NULL = whole household.
-- Clients derive the id deterministically so offline duplicates collapse.
CREATE TABLE budgets (
  id                uuid PRIMARY KEY,
  household_id      uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id       uuid,
  amount            numeric(12, 2) NOT NULL CHECK (amount >= 0),
  client_updated_at timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  rev               bigint NOT NULL DEFAULT 0
);

CREATE TABLE recurring_expenses (
  id                uuid PRIMARY KEY,
  household_id      uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  description       text NOT NULL,
  amount            numeric(12, 2) NOT NULL CHECK (amount > 0),
  category_id       uuid,
  paid_by           uuid NOT NULL REFERENCES users(id),
  splits            jsonb,
  note              text,
  frequency         text NOT NULL CHECK (frequency IN ('week', 'month', 'year')),
  interval_n        int NOT NULL DEFAULT 1 CHECK (interval_n >= 1),
  start_date        date NOT NULL,
  next_due          date NOT NULL,
  active            boolean NOT NULL DEFAULT true,
  client_updated_at timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  rev               bigint NOT NULL DEFAULT 0
);

-- Idempotency log for pushed ops (retries after a lost response are no-ops).
CREATE TABLE applied_ops (
  op_id      text PRIMARY KEY,
  user_id    uuid,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- rev triggers + (household_id, rev) indexes for pull
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','households','household_members','categories',
                           'expenses','settlements','budgets','recurring_expenses']
  LOOP
    EXECUTE format('CREATE TRIGGER %I_rev BEFORE INSERT OR UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION stamp_rev()', t, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['categories','expenses','settlements','budgets','recurring_expenses']
  LOOP
    EXECUTE format('CREATE INDEX %I_hh_rev_idx ON %I (household_id, rev)', t, t);
  END LOOP;
END $$;
