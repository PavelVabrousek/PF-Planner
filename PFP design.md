# PF Planner (PFP)

Professional personal finance and portfolio management platform focused on:

* investment tracking,
* net worth management,
* cash flow planning,
* subscriptions,
* real estate,
* tax estimation for Czech users,
* long-term financial planning.

Designed as a modular financial command center with a dense, professional mobile-first UI.

---

# Vision

PFP aims to become a unified personal financial operating system.

Not just:

* a stock tracker,
* a budgeting app,
* or a passive net worth calculator.

The application should combine:

* portfolio management,
* personal finance planning,
* asset management,
* recurring expenses,
* property tracking,
* tax estimation,
* and long-term forecasting.

---

# Core Product Philosophy

## Mobile First

Primary target:

* modern smartphones,
* dense compact UI,
* quick access to key metrics.

Desktop version expands into:

* multi-column analytics,
* advanced reports,
* planning tools.

---

## Professional Financial UI

Design inspired by:

* professional trading tools,
* investment terminals,
* modern fintech dashboards,
* enterprise analytics panels.

The app intentionally prioritizes:

* information density,
* analytical clarity,
* compact layouts,
* fast scanning.

Over:

* oversized whitespace,
* casual budgeting aesthetics,
* consumer-style playful fintech design.

---

# MVP Scope (Phase 1)

## Portfolio Tracker

### Features

* manual transactions
* multiple portfolios
* stocks / ETFs / crypto
* dividends
* realized & unrealized P/L
* holdings overview
* portfolio allocation
* portfolio performance charts

---

## Market Data

### Daily Historical Prices

Stored in database:

* OHLC daily candles
* adjusted close
* volume

Granularity:

* daily only

Reason:

* lower storage cost,
* simpler analytics,
* scalable MVP architecture.

---

## Intraday Data

Intraday quotes:

* fetched live from external APIs,
* optionally cached on frontend,
* not permanently stored in database.

---

## Corporate Actions

Supported:

* dividends
* stock splits

Dividend semantics:

* corporate-action dividends represent market-level declared events,
* transaction dividends represent user-level received cash,
* portfolio income calculations must not double-count dividends.

Future:

* spin-offs
* mergers
* ticker migrations

---

## Import/Export

### Supported

* CSV import
* Google Sheets portfolio import
* manual paste parser

### Import Principles

Imported data should be:

* validated before write,
* previewed before commit,
* checked for duplicates,
* linked to source metadata when possible.

### Future

* broker integrations
* automatic synchronization

---

# Planned Modules

## Phase 2

* dividends planner
* tax estimation (Czech Republic)
* FX exposure
* subscription management

---

## Phase 3

* real estate tracking
* maintenance costs
* loan management
* recurring liabilities
* retirement forecasting

---

## Phase 4

* AI financial insights
* tax optimization
* scenario simulations
* Monte Carlo projections
* long-term planning assistant

---

# Architecture

## Frontend

### Stack

* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui
* React Query
* Zustand

---

## Backend

### Platform

* Supabase
* PostgreSQL
* Row Level Security

---

## Hosting

* Vercel

---

## Charts

* Recharts

---

## Icons

* Lucide

---

## Package Manager

Default:

* pnpm

Unless repository configuration later explicitly chooses another package manager.

---

# Database Principles

## Store Raw Transactions

All transactions remain immutable:

* BUY
* SELL
* DIVIDEND
* FEE
* TAX

Corporate actions are stored separately.

This preserves:

* auditability,
* future tax calculations,
* financial consistency.

---

## Financial Precision

Financial values must be stored and calculated carefully:

* money, prices, quantities, and FX rates should use decimal-safe database types,
* JavaScript floating point must not be used carelessly for persisted financial results,
* rounding should happen at display boundaries unless a domain rule requires earlier rounding,
* currency is a first-class field and must not be inferred only from portfolio base currency.

---

# Suggested Database Schema

This schema is directional. Real migrations should add:

* primary keys,
* foreign keys,
* timestamps,
* indexes,
* constraints,
* Row Level Security policies.

## profiles

```sql
id
display_name
base_currency
created_at
updated_at
```

## portfolios

```sql
id
user_id
name
base_currency
created_at
updated_at
```

## assets

```sql
id
symbol
exchange
currency
asset_type
name
created_at
updated_at
```

## transactions

```sql
id
portfolio_id
asset_id
type
quantity
price
fee
tax
currency
trade_date
source
external_id
notes
created_at
```

## daily_prices

```sql
asset_id
date
open
high
low
close
adjusted_close
volume
created_at
```

## corporate_actions

```sql
asset_id
type
ex_date
pay_date
amount
ratio
currency
created_at
```

---

## imports

```sql
id
user_id
source
source_hash
status
created_at
```

---

## Data Ownership

User-owned data:

* profiles
* portfolios
* transactions
* imports
* user settings

Shared/reference data:

* assets
* daily_prices
* corporate_actions
* FX rates

Shared/reference data should be writable only by trusted server jobs or administrators. Normal users should access it through read policies or server-controlled flows.

---

## Important Constraints

Recommended constraints:

* unique asset identity by symbol and exchange,
* unique daily price by asset and date,
* valid transaction type,
* valid asset type,
* positive quantities where applicable,
* valid ISO-style currency codes,
* user ownership enforced by RLS policies.

---

# Market Data Sources

## Primary

Yahoo Finance ecosystem (`yfinance`)

---

## Secondary

Stooq

---

## FX Rates

European Central Bank feed

---

## Market Data Runtime

Market data should be abstracted behind provider interfaces.

Implementation notes:

* daily historical sync should run through scheduled jobs or external workers,
* cron endpoints must be protected by a secret,
* provider-specific code should not leak into portfolio calculation logic,
* `yfinance` may require a Python-compatible runtime, so production deployment must explicitly choose where it runs.

---

# UI Concept

## Selected Dashboard Style

Modular Grid / Control Panel

Characteristics:

* compact widgets,
* modular dashboard,
* high information density,
* expandable financial cockpit architecture.

---

# Widget System

## Planned Widgets

* Net Worth
* Portfolio
* Holdings
* Cash Flow
* Dividends
* Taxes
* Properties
* Subscriptions
* Upcoming Events
* FX Exposure
* AI Insights

---

# Design Language

## Dark Theme First

### Background Palette

```text
#0F1115
#151922
#1B2130
```

---

## Accent Colors

```text
Positive: #22C55E
Negative: #EF4444
Neutral:  #3B82F6
Warning:  #F59E0B
```

---

# UI Principles

## Typography

* compact
* readable
* monospace financial numbers

---

## Layout

* dense but structured
* minimal wasted space
* fast scanning

---

## Icons

* outline icons only
* compact sizing
* icon-first navigation

---

# Navigation Structure

## Bottom Navigation

```text
Home
Assets
Cash Flow
Plan
Reports
More
```

---

# Performance Strategy

## API Calls

Avoid excessive polling.

Use:

* daily cron synchronization,
* frontend caching,
* on-demand refresh.

Cron or scheduled synchronization must not expose secrets and must avoid request-time long-running work.

---

## Data Storage

Only daily historical data stored permanently.

No permanent intraday storage in MVP.

---

# Scalability Strategy

## MVP Priorities

* simplicity
* low infrastructure cost
* rapid iteration
* AI-assisted development

---

## Future Scalability

Architecture prepared for:

* multiple asset classes,
* large historical datasets,
* advanced analytics,
* tax engines,
* AI forecasting.

Multi-currency support should remain possible from the beginning. Avoid models that assume every asset, transaction, and report uses a single currency.

---

# AI-Assisted Development

The project is designed for iterative AI-assisted development using:

* ChatGPT,
* Codex,
* AGENTS.md project guidance.

Recommended workflow:

* small iterative tasks,
* strong markdown documentation,
* modular architecture,
* explicit coding conventions.

Codex performs best with:

* structured repositories,
* detailed documentation,
* clearly separated modules. ([OpenAI Developers][1])

---

# Recommended Repository Structure

```text
/apps/web
/apps/api
/packages/ui
/packages/db
/packages/shared
/docs
```

---

# Recommended Additional Files

## AGENTS.md

Project-specific AI instructions for Codex.

Codex automatically reads AGENTS.md files to understand:

* architecture,
* coding conventions,
* workflows,
* testing commands. ([OpenAI Developers][1])

---

## docs/

Markdown specifications:

* architecture
* database
* widgets
* API contracts
* roadmap
* portfolio math
* tax logic
* design system

---

# Long-Term Goal

PFP should evolve into:

* a unified financial operating system,
* combining investments,
* personal finance,
* taxes,
* assets,
* liabilities,
* and long-term financial planning.

Optimized for:

* analytical users,
* investors,
* professionals,
* long-term wealth management.

[1]: https://developers.openai.com/codex/guides/agents-md/?utm_source=chatgpt.com "Custom instructions with AGENTS.md"
