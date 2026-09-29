# family-api

This is a lightweight sync server for the Family Expenses app. It is a single Node process (Hono) in front of Postgres, and runs in about 40 MB of RAM. It replaces Supabase.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | Body `{phone, name, deviceName?, inviteCode?}`, returns `{token, user}`. An existing number that already belongs to a family must also send that family's invite code; without it the server returns `409 INVITE_REQUIRED`. |
| POST | `/auth/logout` | Revokes this device's token. |
| GET/PATCH | `/me` | Profile (name and colour) and the list of devices. |
| DELETE | `/me/devices/:id` | Signs out another device. |
| POST | `/households` | Body `{name, currency}`. Creates the family and its default categories. |
| POST | `/households/join` | Body `{code}`. |
| PATCH | `/households/:id` | Owner only. Body `{name?, currency?}`. |
| POST | `/households/:id/rotate-code` | Owner only. Issues a new invite code. |
| POST | `/households/:id/leave` | Ownership passes to the longest-standing member. |
| DELETE | `/households/:id/members/:userId` | Owner only. Removes a member. |
| POST | `/sync/push` | Body `{ops:[{opId, entity, id, householdId, deleted?, data, clientUpdatedAt}]}`. |
| GET | `/sync/pull?since=<cursor>` | Returns changed rows plus the new `cursor`, along with the households, members and users. |

All endpoints except login need `Authorization: Bearer <device token>`.

### How sync works

- **Row versions.** Every row gets a `rev` from a global sequence each time it is written. Clients ask for everything with `rev > cursor`. Writers take a single advisory lock, so revs become visible in order and a client can never skip a row.
- **Record IDs.** Records use client-generated UUIDs. The server keeps a log of `opId`s it has applied, so a retried push does nothing the second time.
- **Conflicts.** Edits resolve last-write-wins by `clientUpdatedAt`. Deletes are soft (a `deleted_at` tombstone) and always win.
- **Duplicate prevention.** Budgets and recurring-expense instances use deterministic IDs (uuidv5), so two phones that create the same thing offline end up with one row.
- **Entities.** The syncable entities are `categories`, `expenses`, `settlements`, `budgets` and `recurring`.

## Live deployment (estentities.org)

- **URL:** `https://estentities.org/family-api/`. The app uses this through `EXPO_PUBLIC_API_URL` in `eas.json`.
- **Service:** `/opt/family-api`, run by systemd as `family-api` (user `familyapi`), listening only on 127.0.0.1:8791.
- **Database:** `family`, owned by role `family`, in the server's existing Postgres 14. The credentials are in `/opt/family-api/.env` (mode 600).
- **nginx:** a `location /family-api/` block in `/etc/nginx/sites-enabled/estentities.org.conf`. A backup of the original file is in `/root/estentities.org.conf.bak.*`.
- **Redeploy:** run `./deploy.sh`. It syncs the code, installs dependencies, runs migrations, restarts the service and checks health.
- **Logs:** `journalctl -u family-api -f`

## Deploy elsewhere (Docker)

```bash
cd family_expenses/server
cp .env.example .env        # set POSTGRES_PASSWORD / DATABASE_URL
docker compose up -d --build
curl http://127.0.0.1:8787/health
```

Migrations run automatically when the container starts.

**Using the Postgres that is already on the box.** You can skip the bundled `db` service:

```sql
CREATE ROLE family LOGIN PASSWORD '…';
CREATE DATABASE family OWNER family;
```

Then set `DATABASE_URL=postgres://family:…@host.docker.internal:5432/family` and run `docker compose up -d --build api`. On Linux, also add `extra_hosts: ["host.docker.internal:host-gateway"]` to the `api` service.

**TLS.** Put the API behind Caddy or nginx. With Caddy, this is all it takes:

```
family.estentities.org {
  reverse_proxy 127.0.0.1:8787
}
```

**Point the app at the server.** Set `EXPO_PUBLIC_API_URL=https://family.estentities.org` in `family_expenses/eas.json`.

## One-time import from Supabase

```bash
# phones.csv: which phone number each old email account will use
printf 'email,phone\nme@example.com,0771234567\n' > phones.csv
SUPABASE_DB_URL='postgresql://postgres.<ref>:<pw>@…pooler.supabase.com:5432/postgres' \
DATABASE_URL='postgres://family:…@127.0.0.1:5432/family' \
  npm run import:supabase -- --phones phones.csv --dry-run   # check counts first
# …then run the same command again without --dry-run
```

The import keeps all IDs and invite codes, and turns the text categories into synced category rows. Any user without a phone number in the CSV is imported with no phone, so they cannot log in. Set one with `UPDATE users SET phone = '+263…' WHERE id = '…'`.

## Develop and test

```bash
npm install
npm test          # runs against an in-memory Postgres (PGlite); no database needed
DATABASE_URL=postgres://… npm run migrate && npm run dev
```
