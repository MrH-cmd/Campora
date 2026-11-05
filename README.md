# Vybe Market

University marketplace: products, services, storefronts, orders, messaging, seller plans, Store Boosts and an admin dashboard. Starts with Covenant University and supports more universities from the admin settings.

Stack: Next.js 16, React 19, TypeScript, Tailwind 4, Motion, Recharts, PostgreSQL with Row Level Security.

## Run it locally

You need Node 22 and PostgreSQL 16.

    cp .env.example .env        # set DATABASE_URL, APP_URL=http://localhost:3000, EMAIL_DRIVER=outbox
    npm install
    npm run db:reset            # drops everything, migrates, loads sample data
    npm run dev

Sample accounts, loaded only by `db:reset` (password `campora-dev-1`, or SEED_PASSWORD): `admin@campora.test`, `buyer@campora.test`, and sellers `kicks@`, `bowl@`, `lens@`, `wear@`, `tech@`, `glow@campora.test`.

Emails appear at `/dev/mailbox` while EMAIL_DRIVER=outbox. That page returns 404 with any other driver.

All sample rows have `is_sample = true` and show a Sample label. Sample images are generated artwork, not product photos.

## Tests

    npm test             # database rules and RLS, against campora_test
    npm run build && npm run test:e2e   # full browser journeys

The e2e run starts a fake Paystack server (`tests/e2e/fake-gateway.mjs`). It's used only there; the app has no simulated payment path.

## Deploy (Vercel and Supabase)

1. Create a Supabase project. Copy the pooled connection string into DATABASE_URL.
2. Migrations and first-time seed data run during the Vercel build.
3. Create a Storage bucket called `campora`, private. Files are served through `/files`, which checks access.
4. Set the variables from `.env.example` in Vercel. `vercel.json` schedules the daily sweep; Vercel sends CRON_SECRET as a bearer token.
5. Set webhook URLs in the provider dashboards:
   - Paystack: `https://your-domain.com/api/webhooks/paystack`
   - Flutterwave: `https://your-domain.com/api/webhooks/flutterwave`

On Vercel, `npm run vercel-build` applies new migrations before each build. It seeds an empty database with reference data only: the university, categories, plans and settings. Sample data needs `tsx scripts/seed.ts --sample` and never runs on Vercel.

## How the important parts work

Security. The app connects once, and each user request runs in a transaction with `set local role campora_app` and `app.user_id`. RLS policies in `db/migrations/0003_rls.sql` apply to that role. `asSystem` skips RLS and is only used by trusted server code after an authorisation check.

Plan limits. Listing and photo limits are database triggers in `0002_functions.sql`, so no code path can skip them. `effective_plan()` drops an expired plan to K-Leg at once.

Payments. `settleTransaction` is the only code that marks money as received. It asks the provider directly and checks amount and currency. The browser callback and the webhook both call it, and it's safe to run twice.

Money flow. Pay-at-pickup orders settle between buyer and seller, so Campora takes no commission on them. Online payments are held by Campora's provider account until pickup. Completing an order needs the buyer's pickup code, then records commission and seller earnings. Payouts are recorded by an admin after a manual bank transfer.

Daily sweep (`/api/cron/daily`). Cancels unpaid orders after an hour, ends boosts, expires plans, grants monthly credits, and deactivates the oldest listings above a seller's limit.

Adding a future module (events, jobs and so on). Add a migration with RLS, keep rows tied to `university_id`, and add a route group under `src/app`.
