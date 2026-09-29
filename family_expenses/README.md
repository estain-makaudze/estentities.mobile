# Family Expenses 👨‍👩‍👧‍👦

A shared family expense app built with Expo. It works **fully offline** and syncs with your own lightweight server (`server/`, which runs Node and Postgres) whenever the phone has internet.

## Features
- **Offline first.** Everything is stored in SQLite on the phone. Changes queue up and sync automatically when the phone reconnects, returns to the foreground, or once a minute while the app is open.
- **Phone login with no password.** Sign in with your phone number and name. Create a family and share its invite code, or join an existing family with a code.
- **Home.** Shows this month's family spending against the budget, what you owe or are owed, quick actions, and the latest transactions.
- **Statistics.**
  - A 6-month spend-vs-budget bar chart; tap a month to switch to it.
  - A category donut chart.
  - A cumulative spending-pace chart compared with last month.
  - Who paid versus each person's fair share.
  - Insights: pace versus last month, a month-end projection, categories that are rising, the biggest expense, no-spend days, the busiest weekday, and fixed bills as a share of spending.
- **Budgets.** Set a monthly budget for the family and for each category. You get notifications at 80% and 100%.
- **Recurring bills.** Rent, fees and subscriptions are added automatically when due, even offline. You get a reminder the day before.
- **Splits and balances.** Split expenses equally, by custom percentages, or not at all. Each category can have a default split. Debts are simplified to the fewest payments, and you can record settle-up payments.
- **Categories** are shared by the whole family, and each has an emoji and a colour.

## Run
```bash
npm install
npx expo run:android        # needs a dev build (expo-sqlite, secure-store, notifications)
```
Set the server address in `eas.json` (`EXPO_PUBLIC_API_URL`), or enter it in the app under **Login → Server settings**. For local testing, run `cd server && npm run dev` and use `http://<your-LAN-IP>:8787`. The Android emulator reaches your machine at `http://10.0.2.2:8787`.

## Layout
| Path | What |
|---|---|
| `db/` | SQLite schema (`database.ts`), writes plus outbox (`repo.ts`), analytics queries (`queries.ts`) |
| `services/syncEngine.ts` | Outbox push and cursor pull, with backoff and NetInfo/AppState triggers |
| `context/` | Session (`AuthContext`), current family (`HouseholdContext`), data API (`AppContext`) |
| `utils/` | Balances, splits, insights, recurring generation, notifications |
| `components/` | Design system (`ui.tsx`), SVG charts, tab bar |
| `server/` | Sync API. Deployment and the Supabase import are in `server/README.md` |

## Tests
```bash
cd server
npm test              # API + Supabase import, against in-memory Postgres
npm run test:client   # two simulated phones running the app's real SQLite/sync code
```
