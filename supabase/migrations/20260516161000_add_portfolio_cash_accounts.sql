create table public.portfolio_cash_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  broker text not null,
  currency char(3) not null,
  name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_cash_accounts_broker_not_blank check (length(btrim(broker)) > 0),
  constraint portfolio_cash_accounts_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint portfolio_cash_accounts_name_not_blank check (name is null or length(btrim(name)) > 0)
);

create unique index portfolio_cash_accounts_portfolio_broker_currency_key
on public.portfolio_cash_accounts (portfolio_id, lower(broker), currency);

create index portfolio_cash_accounts_portfolio_id_idx
on public.portfolio_cash_accounts (portfolio_id);

create trigger portfolio_cash_accounts_set_updated_at
before update on public.portfolio_cash_accounts
for each row execute function public.set_updated_at();

alter table public.portfolio_cash_accounts enable row level security;

create policy "Users can read own portfolio cash accounts"
on public.portfolio_cash_accounts for select
to authenticated
using (
  exists (
    select 1
    from public.portfolios p
    where p.id = portfolio_cash_accounts.portfolio_id
      and p.user_id = auth.uid()
  )
);

create policy "Users can insert own portfolio cash accounts"
on public.portfolio_cash_accounts for insert
to authenticated
with check (
  exists (
    select 1
    from public.portfolios p
    where p.id = portfolio_cash_accounts.portfolio_id
      and p.user_id = auth.uid()
  )
);

create policy "Users can update own portfolio cash accounts"
on public.portfolio_cash_accounts for update
to authenticated
using (
  exists (
    select 1
    from public.portfolios p
    where p.id = portfolio_cash_accounts.portfolio_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.portfolios p
    where p.id = portfolio_cash_accounts.portfolio_id
      and p.user_id = auth.uid()
  )
);

create policy "Users can delete own portfolio cash accounts"
on public.portfolio_cash_accounts for delete
to authenticated
using (
  exists (
    select 1
    from public.portfolios p
    where p.id = portfolio_cash_accounts.portfolio_id
      and p.user_id = auth.uid()
  )
);

alter table public.transactions
add column cash_account_id uuid references public.portfolio_cash_accounts(id);

create index transactions_cash_account_id_idx
on public.transactions (cash_account_id);

alter table public.transactions
drop constraint transactions_type_valid;

alter table public.transactions
add constraint transactions_type_valid check (
  type in (
    'BUY',
    'SELL',
    'DIVIDEND',
    'FEE',
    'TAX',
    'CASH_DEPOSIT',
    'CASH_WITHDRAWAL',
    'CASH_ADJUSTMENT'
  )
);

alter table public.transactions
add constraint transactions_cash_type_shape check (
  type not in ('CASH_DEPOSIT', 'CASH_WITHDRAWAL', 'CASH_ADJUSTMENT')
  or (
    cash_account_id is not null
    and asset_id is null
    and quantity is null
    and price is null
    and gross_amount is not null
  )
);

create or replace function public.validate_transaction_cash_account()
returns trigger
language plpgsql
as $$
begin
  if new.cash_account_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.portfolio_cash_accounts pca
    where pca.id = new.cash_account_id
      and pca.portfolio_id = new.portfolio_id
  ) then
    raise exception 'Transaction cash account must belong to the same portfolio.';
  end if;

  return new;
end;
$$;

create trigger transactions_validate_cash_account
before insert or update of portfolio_id, cash_account_id
on public.transactions
for each row execute function public.validate_transaction_cash_account();
