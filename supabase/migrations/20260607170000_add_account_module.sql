begin;

-- Partner registry

create table public.partners (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  legal_name text,
  partner_kind text not null default 'UNKNOWN',
  tax_id text,
  registration_id text,
  website text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partners_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint partners_partner_kind_valid check (
    partner_kind in ('PERSON', 'COMPANY', 'INSTITUTION', 'GOVERNMENT', 'HOUSEHOLD', 'UNKNOWN')
  )
);

create table public.partner_roles (
  id uuid primary key default extensions.gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  role text not null,
  valid_from date,
  valid_to date,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_roles_role_valid check (
    role in (
      'BANK',
      'BROKER',
      'INSURER',
      'EMPLOYER',
      'LANDLORD',
      'TENANT',
      'LENDER',
      'BORROWER',
      'UTILITY_PROVIDER',
      'SERVICE_PROVIDER',
      'STATE_INSTITUTION',
      'TAX_AUTHORITY',
      'HEALTH_INSURANCE',
      'PENSION_PROVIDER',
      'PHYSICAL_PERSON',
      'MERCHANT',
      'OTHER'
    )
  ),
  constraint partner_roles_valid_dates check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create table public.partner_contacts (
  id uuid primary key default extensions.gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  contact_type text not null default 'GENERAL',
  contact_person text,
  email text,
  phone text,
  notes text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_contacts_type_valid check (
    contact_type in ('GENERAL', 'SUPPORT', 'ADVISOR', 'BILLING', 'CLAIMS', 'OTHER')
  )
);

create table public.partner_addresses (
  id uuid primary key default extensions.gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  address_type text not null default 'MAILING',
  line1 text,
  line2 text,
  city text,
  postal_code text,
  country char(2),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_addresses_type_valid check (
    address_type in ('REGISTERED', 'MAILING', 'BILLING', 'PROPERTY', 'OTHER')
  ),
  constraint partner_addresses_country_format check (country is null or country ~ '^[A-Z]{2}$')
);

-- Banking / cashflow model

create table public.financial_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider_partner_role_id uuid references public.partner_roles(id),
  name text not null,
  account_type text not null,
  direction text not null,
  currency char(3) not null,
  opening_date date,
  target_close_date date,
  account_number_mask text,
  iban_mask text,
  credit_limit numeric(38, 8),
  include_in_net_worth boolean not null default true,
  is_active boolean not null default true,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_accounts_name_not_blank check (length(btrim(name)) > 0),
  constraint financial_accounts_type_valid check (
    account_type in (
      'CURRENT',
      'SAVINGS',
      'CASH_WALLET',
      'CREDIT_CARD',
      'LOAN',
      'MORTGAGE',
      'PRIVATE_LOAN',
      'OTHER_ASSET',
      'OTHER_LIABILITY'
    )
  ),
  constraint financial_accounts_direction_valid check (direction in ('ASSET', 'LIABILITY', 'RECEIVABLE')),
  constraint financial_accounts_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint financial_accounts_credit_limit_non_negative check (credit_limit is null or credit_limit >= 0),
  constraint financial_accounts_dates_valid check (
    target_close_date is null or opening_date is null or target_close_date >= opening_date
  )
);

create table public.account_balance_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.financial_accounts(id) on delete cascade,
  balance_date date not null,
  balance numeric(38, 8) not null,
  currency char(3) not null,
  source text not null default 'MANUAL',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_balance_snapshots_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint account_balance_snapshots_source_valid check (source in ('MANUAL', 'IMPORT', 'ADJUSTMENT'))
);

create table public.account_rate_periods (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.financial_accounts(id) on delete cascade,
  rate_type text not null,
  annual_rate_percent numeric(18, 8) not null,
  valid_from date not null,
  valid_to date,
  capitalization_period text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_rate_periods_rate_type_valid check (
    rate_type in ('SAVINGS_INTEREST', 'LOAN_INTEREST', 'CARD_APR', 'PROMOTIONAL', 'OTHER')
  ),
  constraint account_rate_periods_dates_valid check (valid_to is null or valid_to >= valid_from)
);

create table public.cashflow_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.cashflow_categories(id) on delete set null,
  name text not null,
  category_type text not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cashflow_categories_name_not_blank check (length(btrim(name)) > 0),
  constraint cashflow_categories_type_valid check (
    category_type in ('INCOME', 'SPEND', 'TRANSFER', 'DEBT', 'SAVING', 'TAX', 'OTHER')
  )
);

create table public.credit_facilities (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.financial_accounts(id) on delete cascade,
  counterparty_partner_role_id uuid references public.partner_roles(id),
  facility_type text not null,
  facility_direction text not null,
  principal_amount numeric(38, 8),
  current_principal numeric(38, 8),
  monthly_payment numeric(38, 8),
  payment_day integer,
  start_date date,
  target_end_date date,
  grace_period_days integer,
  interest_rate_percent numeric(18, 8),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_facilities_type_valid check (
    facility_type in ('CREDIT_CARD', 'MORTGAGE', 'CONSUMER_LOAN', 'PRIVATE_LOAN', 'OTHER')
  ),
  constraint credit_facilities_direction_valid check (facility_direction in ('BORROWED', 'LENT')),
  constraint credit_facilities_payment_day_valid check (payment_day is null or payment_day between 1 and 31),
  constraint credit_facilities_non_negative_amounts check (
    (principal_amount is null or principal_amount >= 0)
    and (current_principal is null or current_principal >= 0)
    and (monthly_payment is null or monthly_payment >= 0)
    and (grace_period_days is null or grace_period_days >= 0)
  )
);

create table public.account_transactions (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.financial_accounts(id) on delete cascade,
  counterparty_partner_role_id uuid references public.partner_roles(id),
  category_id uuid references public.cashflow_categories(id) on delete set null,
  transaction_date date not null,
  posted_at timestamptz,
  amount numeric(38, 8) not null,
  currency char(3) not null,
  direction text not null,
  transaction_type text not null,
  transfer_group_id uuid,
  description text,
  external_id text,
  source text not null default 'MANUAL',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_transactions_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint account_transactions_direction_valid check (direction in ('INFLOW', 'OUTFLOW')),
  constraint account_transactions_amount_non_negative check (amount >= 0),
  constraint account_transactions_type_valid check (
    transaction_type in (
      'INCOME',
      'SPEND',
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'SERVICE_PAYMENT',
      'UTILITY_PAYMENT',
      'INSURANCE_PAYMENT',
      'LOAN_PAYMENT',
      'INTEREST_INCOME',
      'INTEREST_EXPENSE',
      'FEE',
      'TAX',
      'ADJUSTMENT'
    )
  ),
  constraint account_transactions_source_valid check (source in ('MANUAL', 'IMPORT', 'ADJUSTMENT'))
);

create table public.credit_installments (
  id uuid primary key default extensions.gen_random_uuid(),
  credit_facility_id uuid not null references public.credit_facilities(id) on delete cascade,
  due_date date not null,
  expected_amount numeric(38, 8) not null,
  principal_amount numeric(38, 8),
  interest_amount numeric(38, 8),
  fee_amount numeric(38, 8),
  currency char(3) not null,
  status text not null default 'PLANNED',
  paid_transaction_id uuid references public.account_transactions(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_installments_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint credit_installments_status_valid check (status in ('PLANNED', 'DUE', 'PAID', 'SKIPPED', 'OVERDUE')),
  constraint credit_installments_non_negative_amounts check (
    expected_amount >= 0
    and (principal_amount is null or principal_amount >= 0)
    and (interest_amount is null or interest_amount >= 0)
    and (fee_amount is null or fee_amount >= 0)
  )
);

create table public.recurring_obligations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid references public.financial_accounts(id) on delete set null,
  partner_role_id uuid references public.partner_roles(id),
  category_id uuid references public.cashflow_categories(id) on delete set null,
  obligation_type text not null,
  name text not null,
  amount numeric(38, 8),
  currency char(3),
  frequency text not null,
  next_due_date date,
  start_date date,
  end_date date,
  auto_generate_days_ahead integer not null default 45,
  is_active boolean not null default true,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_obligations_name_not_blank check (length(btrim(name)) > 0),
  constraint recurring_obligations_currency_format check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint recurring_obligations_amount_non_negative check (amount is null or amount >= 0),
  constraint recurring_obligations_generate_days_non_negative check (auto_generate_days_ahead >= 0),
  constraint recurring_obligations_type_valid check (
    obligation_type in (
      'INCOME',
      'SPEND',
      'SERVICE',
      'UTILITY',
      'INSURANCE',
      'LOAN_PAYMENT',
      'CREDIT_CARD_PAYMENT',
      'SAVINGS_REVIEW',
      'BALANCE_CHECK',
      'OTHER'
    )
  ),
  constraint recurring_obligations_frequency_valid check (
    frequency in ('ONCE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM')
  )
);

create table public.scheduled_cash_events (
  id uuid primary key default extensions.gen_random_uuid(),
  obligation_id uuid references public.recurring_obligations(id) on delete cascade,
  account_id uuid references public.financial_accounts(id) on delete set null,
  partner_role_id uuid references public.partner_roles(id),
  due_date date not null,
  expected_amount numeric(38, 8),
  currency char(3),
  status text not null default 'PLANNED',
  matched_transaction_id uuid references public.account_transactions(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_cash_events_currency_format check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint scheduled_cash_events_amount_non_negative check (expected_amount is null or expected_amount >= 0),
  constraint scheduled_cash_events_status_valid check (status in ('PLANNED', 'DUE', 'PAID', 'MISSED', 'CANCELLED'))
);

-- Useful uniqueness / indexes

create unique index partners_user_display_name_key
on public.partners (user_id, lower(display_name));

create unique index partner_roles_partner_role_key
on public.partner_roles (partner_id, role)
where valid_to is null;

create index partner_roles_partner_id_idx on public.partner_roles (partner_id);
create index partner_contacts_partner_id_idx on public.partner_contacts (partner_id);
create index partner_addresses_partner_id_idx on public.partner_addresses (partner_id);

create index financial_accounts_user_id_idx on public.financial_accounts (user_id);
create index financial_accounts_provider_role_idx on public.financial_accounts (provider_partner_role_id);
create index account_balance_snapshots_account_date_idx
on public.account_balance_snapshots (account_id, balance_date desc);

create index account_rate_periods_account_valid_idx
on public.account_rate_periods (account_id, valid_from desc);

create index cashflow_categories_user_id_idx on public.cashflow_categories (user_id);
create index credit_facilities_account_id_idx on public.credit_facilities (account_id);
create index credit_facilities_counterparty_role_idx on public.credit_facilities (counterparty_partner_role_id);

create index account_transactions_account_date_idx
on public.account_transactions (account_id, transaction_date desc);

create index account_transactions_counterparty_role_idx
on public.account_transactions (counterparty_partner_role_id);

create index account_transactions_category_idx
on public.account_transactions (category_id);

create index credit_installments_facility_due_idx
on public.credit_installments (credit_facility_id, due_date);

create index recurring_obligations_user_due_idx
on public.recurring_obligations (user_id, next_due_date);

create index scheduled_cash_events_due_idx
on public.scheduled_cash_events (due_date, status);

create index scheduled_cash_events_account_due_idx
on public.scheduled_cash_events (account_id, due_date);

-- updated_at triggers

create trigger partners_set_updated_at
before update on public.partners
for each row execute function public.set_updated_at();

create trigger partner_roles_set_updated_at
before update on public.partner_roles
for each row execute function public.set_updated_at();

create trigger partner_contacts_set_updated_at
before update on public.partner_contacts
for each row execute function public.set_updated_at();

create trigger partner_addresses_set_updated_at
before update on public.partner_addresses
for each row execute function public.set_updated_at();

create trigger financial_accounts_set_updated_at
before update on public.financial_accounts
for each row execute function public.set_updated_at();

create trigger account_balance_snapshots_set_updated_at
before update on public.account_balance_snapshots
for each row execute function public.set_updated_at();

create trigger account_rate_periods_set_updated_at
before update on public.account_rate_periods
for each row execute function public.set_updated_at();

create trigger cashflow_categories_set_updated_at
before update on public.cashflow_categories
for each row execute function public.set_updated_at();

create trigger credit_facilities_set_updated_at
before update on public.credit_facilities
for each row execute function public.set_updated_at();

create trigger account_transactions_set_updated_at
before update on public.account_transactions
for each row execute function public.set_updated_at();

create trigger credit_installments_set_updated_at
before update on public.credit_installments
for each row execute function public.set_updated_at();

create trigger recurring_obligations_set_updated_at
before update on public.recurring_obligations
for each row execute function public.set_updated_at();

create trigger scheduled_cash_events_set_updated_at
before update on public.scheduled_cash_events
for each row execute function public.set_updated_at();

-- RLS

alter table public.partners enable row level security;
alter table public.partner_roles enable row level security;
alter table public.partner_contacts enable row level security;
alter table public.partner_addresses enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.account_balance_snapshots enable row level security;
alter table public.account_rate_periods enable row level security;
alter table public.cashflow_categories enable row level security;
alter table public.credit_facilities enable row level security;
alter table public.account_transactions enable row level security;
alter table public.credit_installments enable row level security;
alter table public.recurring_obligations enable row level security;
alter table public.scheduled_cash_events enable row level security;

-- Direct user-owned tables

create policy "Users can manage own partners"
on public.partners
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can manage own financial accounts"
on public.financial_accounts
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can manage own cashflow categories"
on public.cashflow_categories
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can manage own recurring obligations"
on public.recurring_obligations
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Partner-owned child tables

create policy "Users can manage own partner roles"
on public.partner_roles
for all
to authenticated
using (
  exists (
    select 1 from public.partners p
    where p.id = partner_roles.partner_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.partners p
    where p.id = partner_roles.partner_id
      and p.user_id = auth.uid()
  )
);

create policy "Users can manage own partner contacts"
on public.partner_contacts
for all
to authenticated
using (
  exists (
    select 1 from public.partners p
    where p.id = partner_contacts.partner_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.partners p
    where p.id = partner_contacts.partner_id
      and p.user_id = auth.uid()
  )
);

create policy "Users can manage own partner addresses"
on public.partner_addresses
for all
to authenticated
using (
  exists (
    select 1 from public.partners p
    where p.id = partner_addresses.partner_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.partners p
    where p.id = partner_addresses.partner_id
      and p.user_id = auth.uid()
  )
);

-- Account-owned child tables

create policy "Users can manage own balance snapshots"
on public.account_balance_snapshots
for all
to authenticated
using (
  exists (
    select 1 from public.financial_accounts fa
    where fa.id = account_balance_snapshots.account_id
      and fa.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.financial_accounts fa
    where fa.id = account_balance_snapshots.account_id
      and fa.user_id = auth.uid()
  )
);

create policy "Users can manage own account rate periods"
on public.account_rate_periods
for all
to authenticated
using (
  exists (
    select 1 from public.financial_accounts fa
    where fa.id = account_rate_periods.account_id
      and fa.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.financial_accounts fa
    where fa.id = account_rate_periods.account_id
      and fa.user_id = auth.uid()
  )
);

create policy "Users can manage own credit facilities"
on public.credit_facilities
for all
to authenticated
using (
  exists (
    select 1 from public.financial_accounts fa
    where fa.id = credit_facilities.account_id
      and fa.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.financial_accounts fa
    where fa.id = credit_facilities.account_id
      and fa.user_id = auth.uid()
  )
);

create policy "Users can manage own account transactions"
on public.account_transactions
for all
to authenticated
using (
  exists (
    select 1 from public.financial_accounts fa
    where fa.id = account_transactions.account_id
      and fa.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.financial_accounts fa
    where fa.id = account_transactions.account_id
      and fa.user_id = auth.uid()
  )
);

create policy "Users can manage own credit installments"
on public.credit_installments
for all
to authenticated
using (
  exists (
    select 1
    from public.credit_facilities cf
    join public.financial_accounts fa on fa.id = cf.account_id
    where cf.id = credit_installments.credit_facility_id
      and fa.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.credit_facilities cf
    join public.financial_accounts fa on fa.id = cf.account_id
    where cf.id = credit_installments.credit_facility_id
      and fa.user_id = auth.uid()
  )
);

create policy "Users can manage own scheduled cash events"
on public.scheduled_cash_events
for all
to authenticated
using (
  (
    obligation_id is not null
    and exists (
      select 1 from public.recurring_obligations ro
      where ro.id = scheduled_cash_events.obligation_id
        and ro.user_id = auth.uid()
    )
  )
  or (
    account_id is not null
    and exists (
      select 1 from public.financial_accounts fa
      where fa.id = scheduled_cash_events.account_id
        and fa.user_id = auth.uid()
    )
  )
)
with check (
  (
    obligation_id is not null
    and exists (
      select 1 from public.recurring_obligations ro
      where ro.id = scheduled_cash_events.obligation_id
        and ro.user_id = auth.uid()
    )
  )
  or (
    account_id is not null
    and exists (
      select 1 from public.financial_accounts fa
      where fa.id = scheduled_cash_events.account_id
        and fa.user_id = auth.uid()
    )
  )
);

commit;