# AGENTS.md

Guidance for AI coding agents working on PF Planner (PFP).

## Product Vision

PFP is a professional personal finance and portfolio management platform for analytical users, investors, and long-term wealth planning.

The product is a modular financial command center, not a casual budgeting app. Preserve these priorities:

- Mobile-first, dense, compact UI.
- Fast scanning of key financial metrics.
- Professional trading-tool and fintech-dashboard feel.
- Portfolio tracking, net worth, cash flow, subscriptions, real estate, Czech tax estimation, and long-term planning as the long-term product direction.
- MVP focus on portfolio tracking, market data, transactions, holdings, allocation, dividends, and performance.

Use `PFP design.md` as the source of truth for product direction until more detailed docs exist.

## Target Stack

- Frontend: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui.
- State and data fetching: React Query and Zustand where appropriate.
- Backend/database: Supabase, PostgreSQL, Row Level Security.
- Charts: Recharts.
- Icons: Lucide.
- Hosting: Vercel.
- Package manager: pnpm unless repository configuration explicitly chooses another tool.

Prefer the existing stack and project conventions over adding new libraries. Ask before adding major production dependencies.

## Repository Shape

The intended long-term structure is:

```text
/apps/web
/apps/api
/packages/ui
/packages/db
/packages/shared
/docs
```

If the repository is not scaffolded yet, create structure incrementally and avoid unnecessary placeholder files.

Treat `/apps/api` as optional or future-facing. It is appropriate for market data jobs, provider adapters, import processing, webhooks, or server-only workflows, but it is not required for simple Supabase reads.

Use nested `AGENTS.md` files later for specialized rules in `apps/web`, `packages/db`, or other large areas.

## Next.js Conventions

- Use the App Router.
- Prefer Server Components by default.
- Use Client Components only for interactivity, browser APIs, local state, charts, or client-only libraries.
- Keep route-level data loading clear and colocated with the relevant route when practical.
- Use typed route params, search params, and API contracts.
- Do not create API routes just to proxy simple Supabase reads.
- Use server routes, server actions, or `/apps/api` when work requires secret keys, third-party provider calls, import validation, cron jobs, webhooks, or privileged server-only behavior.
- Keep server-only logic out of client bundles.
- Use environment variables through server-safe boundaries. Never expose service-role keys to the browser.

## TypeScript Rules

- Use strict TypeScript.
- Avoid `any`; prefer explicit domain types, discriminated unions, or `unknown` with validation.
- Model financial concepts explicitly: transaction type, asset type, currency, portfolio id, quantity, price, fee, tax, trade date.
- Prefer immutable data transformations for portfolio calculations.
- Keep shared types in a shared package once the monorepo structure exists.
- Do not silently coerce financial numbers from strings without validation.

## UI And Design System

PFP uses a dark-theme-first, professional financial interface.

Design rules:

- Mobile-first layout with dense but structured information.
- Compact widgets, dashboards, and control-panel style surfaces.
- Use restrained spacing; avoid oversized marketing-style sections.
- Use shadcn/ui primitives and Tailwind utilities.
- Use Lucide outline icons for navigation, actions, and compact controls.
- Prefer icon-first controls where meaning is clear; add accessible labels/tooltips where needed.
- Use monospace or tabular numeric styling for financial values.
- Keep cards tight, with small radii, generally 8px or less unless the local design system says otherwise.
- Avoid playful consumer-fintech styling, decorative gradients, oversized whitespace, or one-note color palettes.

Core palette:

```text
Background: #0F1115, #151922, #1B2130
Positive:   #22C55E
Negative:   #EF4444
Neutral:    #3B82F6
Warning:    #F59E0B
```

Expected bottom navigation:

```text
Home
Assets
Cash Flow
Plan
Reports
More
```

## Supabase And Database Rules

Use Supabase with PostgreSQL and Row Level Security.

Core schema direction:

```text
profiles
portfolios
assets
transactions
daily_prices
corporate_actions
imports
```

Database principles:

- Store raw transactions immutably.
- Supported transaction types: BUY, SELL, DIVIDEND, FEE, TAX.
- Store corporate actions separately from transactions.
- Supported corporate actions for MVP: dividends and stock splits.
- Transaction rows must carry currency; do not infer transaction currency only from the portfolio or asset.
- Imported transactions should preserve source metadata such as source name, external id, or deterministic import hash when available.
- Store permanent market data only at daily granularity.
- Store daily OHLC, adjusted close, and volume.
- Do not permanently store intraday data in the MVP.
- Intraday quotes may be fetched live and optionally cached on the frontend.
- Prefer migrations over manual schema edits.
- Keep schema changes auditable and reversible when practical.
- Add indexes for user-owned lookups, portfolio queries, asset/date queries, and daily price history.
- Use constraints for valid transaction types, asset types, quantities, dates, and currencies where practical.

## Data Ownership

- User-owned tables include profiles, portfolios, transactions, imports, user settings, and other private financial records.
- Shared/reference tables include assets, daily_prices, corporate_actions, and FX rates unless later docs say otherwise.
- Shared/reference tables should be read-only to normal users and writable only by trusted server jobs or administrators.
- Make ownership boundaries explicit in schema, RLS policies, and application data access helpers.

## Import And Data Entry

MVP supports CSV import, Google Sheets portfolio import, and manual paste parsing.

- Validate imported rows before writing to the database.
- Show a preview or parsed summary before committing imported transactions.
- Detect likely duplicates using deterministic keys where practical.
- Track import source and external row ids when available.
- Reject or quarantine rows with invalid dates, currencies, symbols, quantities, prices, fees, or taxes.
- Never let client-side validation be the only protection before database writes.

## RLS And Auth Rules

- Enable RLS on user-owned tables.
- Policies must ensure users can access only their own portfolios and related records.
- Policies for transactions should be derived from portfolio ownership.
- Shared/reference data policies should allow safe reads without allowing user writes.
- Never rely only on frontend filtering for authorization.
- Prefer `auth.uid()` based ownership policies.
- Be careful with joins across user-owned tables; verify policies cover indirect access.
- Keep service-role operations server-only.
- Do not expose Supabase service-role keys, database passwords, JWT secrets, or private API keys in client code, logs, docs, screenshots, or examples.

## Portfolio And Financial Math

Financial correctness matters more than UI convenience.

- Preserve raw transactions; do not rewrite history to fix derived values.
- Use adjusted close for historical performance when appropriate.
- Track fees and taxes separately from price.
- Realized and unrealized P/L calculations must be explicit and testable.
- Be clear about cost basis assumptions. If not specified, use a simple documented default for MVP and leave room for Czech tax-specific rules later.
- Splits must adjust quantities/prices through corporate action logic, not by mutating original transactions.
- Corporate-action dividends describe market-level declared events.
- Transaction dividends describe user-level received cash with asset, date, amount, currency, and tax where applicable.
- Never double-count dividends in income, performance, or tax-facing calculations.
- Treat currency as a first-class field. Do not assume all assets share the portfolio base currency.
- FX exposure and ECB rates are planned; avoid designs that make multi-currency support hard later.
- Use decimal-safe approaches for money and quantities. Avoid careless floating-point accumulation for persisted financial results.
- Persist money, prices, quantities, and FX rates with PostgreSQL numeric/decimal-safe types.
- Round at display boundaries unless a domain rule explicitly requires earlier rounding.

## Market Data

Preferred sources:

- Primary: Yahoo Finance ecosystem / yfinance.
- Secondary: Stooq.
- FX rates: European Central Bank feed.

MVP strategy:

- Daily sync for historical prices.
- On-demand refresh for current data.
- Avoid excessive polling.
- Cache carefully and make stale states visible in the UI when useful.
- Abstract market data providers behind provider interfaces.
- Keep provider-specific behavior out of portfolio math.
- If using `yfinance`, explicitly choose a Python-compatible runtime for production jobs.
- Protect cron endpoints with a shared secret or equivalent server-side authorization.

## Vercel Deployment

- Keep the app compatible with Vercel deployments.
- Use Vercel environment variables for production secrets.
- Do not commit `.env` files or secret values.
- Keep build-time and runtime environment requirements documented.
- Prefer serverless-friendly code paths unless a different runtime is explicitly chosen.
- Avoid long-running background work in request/response paths.
- Use scheduled jobs or external workers for market data sync when implemented.
- Cron routes or webhook handlers must verify their caller before doing privileged work.

## Secrets And Security

Never expose secrets.

- Do not print secrets in terminal output, logs, docs, comments, or UI.
- Do not commit API keys, Supabase service-role keys, database URLs with passwords, Vercel tokens, broker credentials, or private financial data.
- Use `.env.local` for local secrets and keep it ignored.
- Use placeholders like `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in documentation.
- Public `NEXT_PUBLIC_*` variables must contain only values safe for browsers.
- Treat financial data as sensitive personal data.

## Testing And Verification

When the project is scaffolded, prefer these commands unless package scripts say otherwise:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

Guidelines:

- Run focused tests for changed code.
- Run lint and typecheck before completing implementation tasks when available.
- Run build before deployment-related changes.
- Add tests for portfolio math, transaction processing, schema policies, and data transforms.
- Add visual/browser checks for significant UI changes.
- If a command is unavailable because the project is not scaffolded yet, say so in the final response instead of inventing results.

## Documentation

Keep docs close to decisions.

Recommended docs:

```text
docs/architecture.md
docs/database.md
docs/design-system.md
docs/mvp.md
docs/portfolio-math.md
docs/roadmap.md
docs/tax-cz.md
docs/widgets.md
```

Update documentation when changing architecture, database behavior, portfolio math, public API contracts, or design-system conventions.

## GitHub Workflow

- Keep changes focused and easy to review.
- Do not rewrite user changes or unrelated files.
- Prefer small incremental commits and PRs.
- Use clear commit messages that describe behavior, not just files changed.
- Before opening a PR, summarize what changed, how it was tested, and any known limitations.

## Agent Working Style

- Read existing files before making assumptions.
- Prefer `rg` for searching.
- Preserve the product direction from `PFP design.md`.
- Keep implementation choices conservative and aligned with the stack.
- Ask only when a decision is genuinely blocked; otherwise make a reasonable, documented choice.
- When unsure about financial logic, make the assumption explicit and add a test or TODO tied to the future domain decision.
