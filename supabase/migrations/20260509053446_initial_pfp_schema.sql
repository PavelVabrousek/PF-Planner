create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  base_currency char(3) not null default 'CZK',
  locale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_base_currency_format check (base_currency ~ '^[A-Z]{3}$')
);

create table public.assets (
  id uuid primary key default extensions.gen_random_uuid(),
  symbol text not null,
  exchange text not null,
  name text,
  currency char(3) not null,
  asset_type text not null,
  data_provider text,
  provider_symbol text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_symbol_not_blank check (length(btrim(symbol)) > 0),
  constraint assets_exchange_not_blank check (length(btrim(exchange)) > 0),
  constraint assets_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint assets_asset_type_valid check (asset_type in ('STOCK', 'ETF', 'CRYPTO', 'CASH'))
);

create table public.daily_prices (
  asset_id uuid not null references public.assets(id) on delete cascade,
  price_date date not null,
  open numeric(38, 12),
  high numeric(38, 12),
  low numeric(38, 12),
  close numeric(38, 12) not null,
  adjusted_close numeric(38, 12),
  volume numeric(38, 8),
  currency char(3) not null,
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (asset_id, price_date),
  constraint daily_prices_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint daily_prices_non_negative_prices check (
    (open is null or open >= 0)
    and (high is null or high >= 0)
    and (low is null or low >= 0)
    and close >= 0
    and (adjusted_close is null or adjusted_close >= 0)
    and (volume is null or volume >= 0)
  ),
  constraint daily_prices_high_above_low check (high is null or low is null or high >= low),
  constraint daily_prices_source_not_blank check (length(btrim(source)) > 0)
);

create table public.corporate_actions (
  id uuid primary key default extensions.gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  type text not null,
  ex_date date not null,
  pay_date date,
  amount numeric(38, 12),
  ratio numeric(38, 12),
  currency char(3),
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corporate_actions_type_valid check (type in ('DIVIDEND', 'SPLIT')),
  constraint corporate_actions_currency_format check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint corporate_actions_source_not_blank check (length(btrim(source)) > 0),
  constraint corporate_actions_dividend_shape check (
    type <> 'DIVIDEND'
    or (amount is not null and amount >= 0 and currency is not null and ratio is null)
  ),
  constraint corporate_actions_split_shape check (
    type <> 'SPLIT'
    or (ratio is not null and ratio > 0 and amount is null and currency is null)
  )
);

create table public.fx_rates (
  rate_date date not null,
  from_currency char(3) not null,
  to_currency char(3) not null,
  rate numeric(38, 12) not null,
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (rate_date, from_currency, to_currency, source),
  constraint fx_rates_from_currency_format check (from_currency ~ '^[A-Z]{3}$'),
  constraint fx_rates_to_currency_format check (to_currency ~ '^[A-Z]{3}$'),
  constraint fx_rates_rate_positive check (rate > 0),
  constraint fx_rates_source_not_blank check (length(btrim(source)) > 0)
);

create table public.portfolios (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  base_currency char(3) not null default 'CZK',
  cost_basis_method text not null default 'FIFO',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolios_name_not_blank check (length(btrim(name)) > 0),
  constraint portfolios_base_currency_format check (base_currency ~ '^[A-Z]{3}$'),
  constraint portfolios_cost_basis_method_valid check (cost_basis_method in ('FIFO', 'AVERAGE'))
);

create table public.imports (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  portfolio_id uuid references public.portfolios(id) on delete set null,
  source text not null,
  source_hash text,
  status text not null default 'DRAFT',
  file_name text,
  row_count integer,
  committed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint imports_source_valid check (source in ('CSV', 'GOOGLE_SHEETS', 'PASTE', 'BROKER', 'MANUAL')),
  constraint imports_status_valid check (status in ('DRAFT', 'VALIDATING', 'VALIDATED', 'COMMITTED', 'FAILED', 'CANCELLED')),
  constraint imports_row_count_non_negative check (row_count is null or row_count >= 0)
);

create table public.transactions (
  id uuid primary key default extensions.gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  asset_id uuid references public.assets(id),
  type text not null,
  trade_date date not null,
  settlement_date date,
  quantity numeric(38, 12),
  price numeric(38, 12),
  gross_amount numeric(38, 8),
  fee numeric(38, 8) not null default 0,
  tax numeric(38, 8) not null default 0,
  currency char(3) not null,
  source text not null,
  external_id text,
  import_id uuid references public.imports(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint transactions_type_valid check (type in ('BUY', 'SELL', 'DIVIDEND', 'FEE', 'TAX')),
  constraint transactions_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint transactions_fee_non_negative check (fee >= 0),
  constraint transactions_tax_non_negative check (tax >= 0),
  constraint transactions_gross_amount_non_negative check (gross_amount is null or gross_amount >= 0),
  constraint transactions_source_valid check (source in ('MANUAL', 'CSV', 'GOOGLE_SHEETS', 'PASTE', 'BROKER')),
  constraint transactions_asset_required check (
    type not in ('BUY', 'SELL', 'DIVIDEND') or asset_id is not null
  ),
  constraint transactions_trade_shape check (
    type not in ('BUY', 'SELL')
    or (quantity is not null and quantity > 0 and price is not null and price >= 0)
  ),
  constraint transactions_non_trade_shape check (
    type in ('BUY', 'SELL')
    or (quantity is null and price is null)
  )
);

create table public.import_rows (
  id uuid primary key default extensions.gen_random_uuid(),
  import_id uuid not null references public.imports(id) on delete cascade,
  row_number integer not null,
  status text not null default 'PENDING',
  raw_data jsonb not null,
  parsed_data jsonb not null default '{}'::jsonb,
  error_messages jsonb not null default '[]'::jsonb,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_rows_row_number_positive check (row_number > 0),
  constraint import_rows_status_valid check (status in ('PENDING', 'VALID', 'INVALID', 'COMMITTED', 'SKIPPED'))
);

create unique index assets_exchange_symbol_key on public.assets (exchange, symbol);
create index assets_type_currency_idx on public.assets (asset_type, currency);
create index daily_prices_price_date_idx on public.daily_prices (price_date desc);
create index corporate_actions_asset_ex_date_idx on public.corporate_actions (asset_id, ex_date desc);
create unique index corporate_actions_dividend_key on public.corporate_actions (asset_id, ex_date, source, amount, currency) where type = 'DIVIDEND';
create unique index corporate_actions_split_key on public.corporate_actions (asset_id, ex_date, source) where type = 'SPLIT';
create index fx_rates_pair_date_idx on public.fx_rates (from_currency, to_currency, rate_date desc);
create index portfolios_user_id_idx on public.portfolios (user_id);
create unique index portfolios_active_name_key on public.portfolios (user_id, lower(name)) where is_archived = false;
create index imports_user_created_idx on public.imports (user_id, created_at desc);
create index imports_portfolio_id_idx on public.imports (portfolio_id);
create unique index imports_source_hash_key on public.imports (user_id, source_hash) where source_hash is not null;
create index transactions_portfolio_id_idx on public.transactions (portfolio_id);
create index transactions_portfolio_trade_date_idx on public.transactions (portfolio_id, trade_date desc);
create index transactions_asset_trade_date_idx on public.transactions (asset_id, trade_date desc);
create index transactions_import_id_idx on public.transactions (import_id);
create unique index transactions_external_id_key on public.transactions (portfolio_id, source, external_id) where external_id is not null;
create unique index import_rows_import_row_number_key on public.import_rows (import_id, row_number);
create index import_rows_import_status_idx on public.import_rows (import_id, status);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger assets_set_updated_at
before update on public.assets
for each row execute function public.set_updated_at();

create trigger daily_prices_set_updated_at
before update on public.daily_prices
for each row execute function public.set_updated_at();

create trigger corporate_actions_set_updated_at
before update on public.corporate_actions
for each row execute function public.set_updated_at();

create trigger fx_rates_set_updated_at
before update on public.fx_rates
for each row execute function public.set_updated_at();

create trigger portfolios_set_updated_at
before update on public.portfolios
for each row execute function public.set_updated_at();

create trigger imports_set_updated_at
before update on public.imports
for each row execute function public.set_updated_at();

create trigger import_rows_set_updated_at
before update on public.import_rows
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.assets enable row level security;
alter table public.daily_prices enable row level security;
alter table public.corporate_actions enable row level security;
alter table public.fx_rates enable row level security;
alter table public.portfolios enable row level security;
alter table public.imports enable row level security;
alter table public.transactions enable row level security;
alter table public.import_rows enable row level security;

create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "Users can insert own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Users can delete own profile"
on public.profiles for delete
to authenticated
using (id = auth.uid());

create policy "Authenticated users can read assets"
on public.assets for select
to authenticated
using (true);

create policy "Authenticated users can read daily prices"
on public.daily_prices for select
to authenticated
using (true);

create policy "Authenticated users can read corporate actions"
on public.corporate_actions for select
to authenticated
using (true);

create policy "Authenticated users can read FX rates"
on public.fx_rates for select
to authenticated
using (true);

create policy "Users can read own portfolios"
on public.portfolios for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own portfolios"
on public.portfolios for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own portfolios"
on public.portfolios for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own portfolios"
on public.portfolios for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own imports"
on public.imports for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own imports"
on public.imports for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    portfolio_id is null
    or exists (
      select 1
      from public.portfolios p
      where p.id = imports.portfolio_id
        and p.user_id = auth.uid()
    )
  )
);

create policy "Users can update own imports"
on public.imports for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (
    portfolio_id is null
    or exists (
      select 1
      from public.portfolios p
      where p.id = imports.portfolio_id
        and p.user_id = auth.uid()
    )
  )
);

create policy "Users can delete own imports"
on public.imports for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own transactions"
on public.transactions for select
to authenticated
using (
  exists (
    select 1
    from public.portfolios p
    where p.id = transactions.portfolio_id
      and p.user_id = auth.uid()
  )
);

create policy "Users can insert own transactions"
on public.transactions for insert
to authenticated
with check (
  exists (
    select 1
    from public.portfolios p
    where p.id = transactions.portfolio_id
      and p.user_id = auth.uid()
  )
  and (
    import_id is null
    or exists (
      select 1
      from public.imports i
      where i.id = transactions.import_id
        and i.user_id = auth.uid()
    )
  )
);

create policy "Users can read own import rows"
on public.import_rows for select
to authenticated
using (
  exists (
    select 1
    from public.imports i
    where i.id = import_rows.import_id
      and i.user_id = auth.uid()
  )
);

create policy "Users can insert own import rows"
on public.import_rows for insert
to authenticated
with check (
  exists (
    select 1
    from public.imports i
    where i.id = import_rows.import_id
      and i.user_id = auth.uid()
  )
);

create policy "Users can update own import rows"
on public.import_rows for update
to authenticated
using (
  exists (
    select 1
    from public.imports i
    where i.id = import_rows.import_id
      and i.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.imports i
    where i.id = import_rows.import_id
      and i.user_id = auth.uid()
  )
);

create policy "Users can delete own import rows"
on public.import_rows for delete
to authenticated
using (
  exists (
    select 1
    from public.imports i
    where i.id = import_rows.import_id
      and i.user_id = auth.uid()
  )
);
