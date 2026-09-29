# AGENTS.md — DAILY_ACCOUNTING Monorepo

## Repository Layout

Three independent **Expo React Native** apps (Expo SDK 54, React 19, TypeScript 5.9) that share no runtime code:

| Directory | Backend | Purpose |
|---|---|---|
| `daily-accounting/` | Odoo JSON-RPC | Daily income/expense entries with offline queue |
| `family_expenses/` | Own API (`family_expenses/server`, Node + Postgres) | Shared family expenses, budgets, recurring bills — offline-first with sync |
| `loan_management/` | Odoo JSON-RPC + Twilio SMS | Loan collection management & application intake |

Each app is fully self-contained — run all commands from **inside** the sub-directory, not the workspace root.

---

## Developer Commands

```bash
# Start dev server (run inside a sub-app directory)
npx expo start
npx expo start -c          # clear Metro cache — use when bundler acts stale

# Platform-specific
expo start --android       # daily-accounting, loan_management
expo run:android           # family_expenses (has native android/ folder)
expo start --ios

# Build APK for testing
eas build -p android --profile preview

# Lint
npm run lint               # runs expo lint (ESLint 9 flat config)
```

> `family_expenses` uses native modules (expo-sqlite, secure-store, notifications) — use a dev build (`expo run:android` / EAS), not Expo Go.
> Its sync server lives in `family_expenses/server` (`npm test`, `npm run test:client`, `docker compose up -d --build`).

---

## State Management Pattern

`daily-accounting` and `loan_management` use **React Context + AsyncStorage**; `family_expenses` uses **expo-sqlite** (see below). No Redux/Zustand/MobX.

Every store follows the same shape:
```tsx
// store/xyzStore.tsx
export function XyzProvider({ children }) {
  const [data, setData] = useState<T[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);         // ← wait for this before rendering
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(raw => { if (raw) setData(JSON.parse(raw)); })
      .finally(() => setIsLoaded(true));
  }, []);
  // mutations call AsyncStorage.setItem then setState
}
export function useXyz() { return useContext(XyzContext); }
```

Provider nesting order matters — check `app/_layout.tsx` in each sub-app before adding a new provider. `QueueProvider` (daily-accounting) must nest inside `SettingsProvider` because it reads settings.

---

## Odoo Integration (daily-accounting & loan_management)

### Transport layer (duplicated in each app)
- `services/odooClient.ts` — `jsonRpc(baseUrl, endpoint, params)` and `callKw(settings, uid, model, method, args, kwargs)`
- Authentication is **stateless per-request**: call `authenticate(settings)` → receive `uid` → pass to every `callKw` call.
- Works against Odoo 16/17/18. All model calls go to `/web/dataset/call_kw`.

### Custom Odoo models used
| App | Models |
|---|---|
| daily-accounting | `daily.category`, `daily.entry`, `res.currency` |
| loan_management | `account.move`, `loan.payment.schedule`, `loan.payment.schedule.line`, `loan.application`, `res.partner` |

### Adding a new Odoo API call
Import `callKw` from `./odooClient`, follow the typed pattern in `services/odooApi.ts` or `services/loanApi.ts`. All connection config comes from `useSettings()`.

---

## Offline-First Patterns

### daily-accounting — write-through queue (`store/queueStore.tsx`)
- Entries are always written to the local `offline_entry_queue` (AsyncStorage) first.
- `QueueProvider` monitors network via `@react-native-community/netinfo` and auto-syncs on reconnect.
- **Upsert logic**: `searchTodayEntry()` checks for an existing `draft` entry for the same category + date; if found, it accumulates the amount instead of creating a duplicate.
- Local categories use **negative integer IDs** (`categoryIsLocal: true`). On sync, they are matched by name or created in Odoo before the entry is posted.

### family_expenses — SQLite source of truth + outbox sync
- `db/database.ts` opens `family.db` (expo-sqlite); **every screen reads from SQLite**, so a cold start offline works.
- Mutations go through `db/repo.ts` `save()` / `remove()`: row write + `outbox` op in **one transaction**, then the sync engine pushes.
- `services/syncEngine.ts`: push outbox → `POST /sync/push`, then `GET /sync/pull?since=<cursor>`; triggers on reconnect (NetInfo), foreground, every 60 s, after writes; exponential backoff. Rejected ops become `failed` (shown in `app/sync-queue.tsx`).
- Records use **client-generated UUIDs** (`utils/ids.ts` `newId`). Budgets and recurring instances use **deterministic ids** (`stableId`) so offline duplicates from two phones merge on the server. Budgets are "removed" by setting amount 0 (server deletes are final).
- Server conflict rule: last-write-wins on `clientUpdatedAt`; deletes (tombstones) always win.
- `splits: SplitEntry[] | null` — `null` means the payer owns 100% (no balance impact). Always check for null before computing shares.
- Login is phone + name (no password). An existing phone in a family must also give that family's invite code.

### loan_management — read cache + manual sync
- `cacheStore.tsx` holds a read-only snapshot (invoices, schedules, due lines) refreshed every 5 minutes or on demand via `refreshAll()`.
- `collectionStore.tsx` is a local-only ledger; records sync to Odoo only when the user taps "Record to Odoo" (`markScheduleLinePaid`).
- Applications (`applicationStore.tsx`) are drafted locally and submitted to Odoo explicitly via `createLoanApplication()`.

---

## Key Configuration

### family_expenses — API server
Set `EXPO_PUBLIC_API_URL` in `eas.json` build profiles (inlined at build time), or enter it in-app under Login → Server settings (stored in SQLite meta `apiUrl`).
Server deploy, env and the one-time Supabase import: see `family_expenses/server/README.md`.

### loan_management — Twilio SMS
Configured in the in-app Settings screen (stored in AsyncStorage key `loan_management_odoo_settings`). Credentials are sent directly from the mobile client to Twilio's REST API (`services/twilioSms.ts`). SMS fires only when `smsEnabled: true` and all three Twilio fields are non-empty.

---

## Important Files

| Path | Role |
|---|---|
| `daily-accounting/store/queueStore.tsx` | Offline queue — core sync logic |
| `daily-accounting/types/odoo.ts` | Canonical Odoo type definitions for this app |
| `family_expenses/context/AppContext.tsx` | `useApp()` data + mutations; `AppProvider` runs recurring generation & budget alerts |
| `family_expenses/services/syncEngine.ts` | Offline outbox push/pull sync |
| `family_expenses/db/repo.ts` | SQLite writes + outbox, pull application |
| `family_expenses/utils/insights.ts` | Spending analysis cards (Statistics tab) |
| `family_expenses/server/` | Hono + Postgres sync API (auth, households, push/pull) |
| `family_expenses/utils/balance.ts` | Balance & debt minimisation algorithm |
| `family_expenses/types/index.ts` | All shared TypeScript interfaces |
| `loan_management/store/cacheStore.tsx` | 5-minute auto-refresh read cache |
| `loan_management/services/twilioSms.ts` | SMS builders and Twilio dispatch |
| `*/app/_layout.tsx` | Provider nesting and route guards per app |

---

## Conventions

- `app-example/` directories are unused Expo template stubs — ignore them.
- `generate_icons.py` — run manually to regenerate app icons from source images.
- Date strings are always `"YYYY-MM-DD"`. ISO timestamps use `.toISOString()`.
- IDs for local-only records are generated with: `` `prefix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` ``
- Odoo Many2one fields arrive as `[number, string]` tuples or `false` (see `Many2OneValue` in `loan_management/types/odoo.ts`).
- The workspace-root `package.json` only contains the shared Supabase dev dependency — it is not an app entry point.

