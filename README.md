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
