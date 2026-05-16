# PF Planner

PF Planner is a local MVP of a professional portfolio dashboard focused on holdings, market data, allocation, dividends, transaction history, and performance tracking.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Recharts
- Supabase / PostgreSQL

## Local Setup

1. Install dependencies:

   ```bat
   npm install
   ```

2. Copy the environment template:

   ```bat
   copy apps\web\.env.example apps\web\.env.local
   ```

3. Fill `apps\web\.env.local` with your Supabase values.

4. Start the local dashboard:

   ```bat
   start-pfp-localhost.bat
   ```

   Or run the web app directly:

   ```bat
   npm run dev
   ```

5. Open:

   ```text
   http://127.0.0.1:3000/
   ```

## Environment Variables

See `apps/web/.env.example` for the expected variables. Keep real secrets only in `.env.local`; it is intentionally ignored by Git.

For local development, use:

```text
PFP_AUTH_MODE=local-bypass
PFP_SUPABASE_USER_ID=<your existing Supabase auth user UUID>
```

For Vercel production, use Google login through Supabase Auth:

```text
PFP_AUTH_MODE=required
PFP_ALLOWED_EMAILS=pavel.vabrousek@gmail.com
NEXT_PUBLIC_SUPABASE_URL=<Supabase Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon public key>
PFP_SUPABASE_DATABASE_URL=<Supabase pooled PostgreSQL connection string>
PFP_SUPABASE_USER_ID=<portfolio owner UUID used by existing data>
PFP_PORTFOLIO_NAME=Google Portfolio Import
PFP_BASE_CURRENCY=CZK
```

The Google account authorizes access to the app. `PFP_SUPABASE_USER_ID` keeps the existing portfolio data owner stable until a later user-data migration is needed.

In Supabase Dashboard, enable Google under `Authentication > Providers`, then add these callback URLs under `Authentication > URL Configuration`:

```text
http://localhost:3000/auth/callback
https://<your-vercel-domain>/auth/callback
```

## Database

The initial Supabase schema lives in:

```text
supabase/migrations/20260509053446_initial_pfp_schema.sql
```

Additional database notes are in:

```text
docs/database.md
```

## Safety Notes

The repository ignores local secrets, imported portfolio paste data, Supabase CLI temp files, build artifacts, logs, and dependency folders.

## Vercel Deployment

PFP is a monorepo and the deployable Next.js app lives in `apps/web`.

In Vercel Project Settings, use:

```text
Framework Preset: Next.js
Root Directory: apps/web
Build Command: npm run build
Output Directory: leave empty / default
Install Command: leave default, or npm install
```

Do not set the Output Directory to `public` or `.next`. Vercel should handle the Next.js build output itself.
