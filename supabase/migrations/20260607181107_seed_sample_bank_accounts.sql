begin;

with selected_user as (
  select p.user_id
  from public.portfolios p
  order by p.created_at, p.id
  limit 1
),
seed_partners as (
  select
    su.user_id,
    values_data.display_name,
    values_data.legal_name,
    values_data.partner_kind,
    values_data.tax_id,
    values_data.registration_id,
    values_data.website,
    values_data.notes,
    values_data.metadata
  from selected_user su
  cross join (
    values
      (
        'ČSOB',
        'Československá obchodní banka, a. s.',
        'COMPANY',
        'CZ699000761',
        '00001350',
        'https://www.csob.cz',
        'Sample partner seeded for Banks, Loans and Accounts design. Official data: registered office Radlická 333/150, Praha 5, phone +420 224 111 111, email info@csob.cz.',
        '{"bank_code":"0300","swift":"CEKOCZPP","data_box":"8qvdk3s","seed_source":"ČSOB annual report / csob.cz"}'::jsonb
      ),
      (
        'Raiffeisenbank',
        'Raiffeisenbank a.s.',
        'COMPANY',
        'CZ699003154',
        '49240901',
        'https://www.rb.cz',
        'Sample partner seeded for Banks, Loans and Accounts design. Official data: headquarters Hvězdova 1716/2b, Praha 4, client line +420 412 440 000, email info@rb.cz.',
        '{"bank_code":"5500","swift":"RZBCCZPP","data_box":"skzfs6u","seed_source":"Raiffeisenbank contacts / rb.cz"}'::jsonb
      ),
      (
        'UniCredit Bank CZ',
        'UniCredit Bank Czech Republic and Slovakia, a.s.',
        'COMPANY',
        'CZ64948242',
        '64948242',
        'https://www.unicreditbank.cz',
        'Sample mortgage partner seeded for Banks, Loans and Accounts design. Official data: registered office Želetavská 1525/1, Praha 4 - Michle, client line +420 221 210 031, email info@unicreditgroup.cz.',
        '{"bank_code":"2700","swift":"BACXCZPP","seed_source":"UniCredit Bank contacts / unicreditbank.cz"}'::jsonb
      ),
      (
        'Pavel Vaněček',
        'Pavel Vaněček',
        'PERSON',
        null,
        null,
        null,
        'Sample physical person partner seeded as borrower for personal loan UI testing.',
        '{"seed_source":"user_provided_sample_data"}'::jsonb
      )
  ) as values_data(display_name, legal_name, partner_kind, tax_id, registration_id, website, notes, metadata)
),
inserted_partners as (
  insert into public.partners (
    user_id,
    display_name,
    legal_name,
    partner_kind,
    tax_id,
    registration_id,
    website,
    notes,
    metadata
  )
  select
    user_id,
    display_name,
    legal_name,
    partner_kind,
    tax_id,
    registration_id,
    website,
    notes,
    metadata
  from seed_partners sp
  where not exists (
    select 1
    from public.partners p
    where p.user_id = sp.user_id
      and lower(p.display_name) = lower(sp.display_name)
  )
  returning id, user_id, display_name
),
all_partners as (
  select id, user_id, display_name
  from inserted_partners
  union all
  select p.id, p.user_id, p.display_name
  from public.partners p
  join seed_partners sp
    on sp.user_id = p.user_id
   and lower(sp.display_name) = lower(p.display_name)
),
seed_roles as (
  select
    ap.id as partner_id,
    values_data.role,
    values_data.is_primary
  from all_partners ap
  join (
    values
      ('ČSOB', 'BANK', true),
      ('Raiffeisenbank', 'BANK', true),
      ('UniCredit Bank CZ', 'BANK', true),
      ('UniCredit Bank CZ', 'LENDER', false),
      ('Pavel Vaněček', 'BORROWER', true),
      ('Pavel Vaněček', 'PHYSICAL_PERSON', false)
  ) as values_data(display_name, role, is_primary)
    on values_data.display_name = ap.display_name
),
inserted_roles as (
  insert into public.partner_roles (partner_id, role, is_primary, metadata)
  select
    sr.partner_id,
    sr.role,
    sr.is_primary,
    '{"seed_sample":true}'::jsonb
  from seed_roles sr
  where not exists (
    select 1
    from public.partner_roles pr
    where pr.partner_id = sr.partner_id
      and pr.role = sr.role
      and pr.valid_to is null
  )
  returning id, partner_id, role
),
all_roles as (
  select id, partner_id, role
  from inserted_roles
  union all
  select pr.id, pr.partner_id, pr.role
  from public.partner_roles pr
  join seed_roles sr on sr.partner_id = pr.partner_id and sr.role = pr.role
  where pr.valid_to is null
),
seed_addresses as (
  select
    ap.id as partner_id,
    values_data.address_type,
    values_data.line1,
    values_data.city,
    values_data.postal_code,
    values_data.country,
    values_data.is_primary
  from all_partners ap
  join (
    values
      ('ČSOB', 'REGISTERED', 'Radlická 333/150', 'Praha 5', '15057', 'CZ', true),
      ('Raiffeisenbank', 'REGISTERED', 'Hvězdova 1716/2b', 'Praha 4', '14078', 'CZ', true),
      ('UniCredit Bank CZ', 'REGISTERED', 'Želetavská 1525/1', 'Praha 4 - Michle', '14092', 'CZ', true),
      ('Pavel Vaněček', 'MAILING', null, 'Praha 7', null, 'CZ', true)
  ) as values_data(display_name, address_type, line1, city, postal_code, country, is_primary)
    on values_data.display_name = ap.display_name
),
inserted_addresses as (
  insert into public.partner_addresses (
    partner_id,
    address_type,
    line1,
    city,
    postal_code,
    country,
    is_primary
  )
  select
    partner_id,
    address_type,
    line1,
    city,
    postal_code,
    country,
    is_primary
  from seed_addresses sa
  where not exists (
    select 1
    from public.partner_addresses pa
    where pa.partner_id = sa.partner_id
      and pa.address_type = sa.address_type
      and coalesce(pa.line1, '') = coalesce(sa.line1, '')
      and coalesce(pa.city, '') = coalesce(sa.city, '')
  )
  returning id
),
seed_contacts as (
  select
    ap.id as partner_id,
    values_data.contact_type,
    values_data.contact_person,
    values_data.email,
    values_data.phone,
    values_data.notes,
    values_data.is_primary
  from all_partners ap
  join (
    values
      ('ČSOB', 'GENERAL', 'ČSOB klientské centrum', 'info@csob.cz', '+420 224 111 111', 'Official general contact from ČSOB public reports/contact data.', true),
      ('Raiffeisenbank', 'GENERAL', 'Raiffeisenbank customer service', 'info@rb.cz', '+420 412 440 000', 'Official customer service contact from Raiffeisenbank contacts page.', true),
      ('UniCredit Bank CZ', 'GENERAL', 'UniCredit Bank customer service', 'info@unicreditgroup.cz', '+420 221 210 031', 'Official customer service contact from UniCredit Bank contacts page.', true),
      ('Pavel Vaněček', 'GENERAL', 'Pavel Vaněček', null, '+420 123456789', 'User-provided sample contact for personal loan borrower.', true)
  ) as values_data(display_name, contact_type, contact_person, email, phone, notes, is_primary)
    on values_data.display_name = ap.display_name
),
inserted_contacts as (
  insert into public.partner_contacts (
    partner_id,
    contact_type,
    contact_person,
    email,
    phone,
    notes,
    is_primary
  )
  select
    partner_id,
    contact_type,
    contact_person,
    email,
    phone,
    notes,
    is_primary
  from seed_contacts sc
  where not exists (
    select 1
    from public.partner_contacts pc
    where pc.partner_id = sc.partner_id
      and pc.contact_type = sc.contact_type
      and coalesce(pc.email, '') = coalesce(sc.email, '')
      and coalesce(pc.phone, '') = coalesce(sc.phone, '')
  )
  returning id
),
seed_accounts as (
  select
    su.user_id,
    ar.id as provider_partner_role_id,
    values_data.partner_name,
    values_data.provider_role,
    values_data.account_name,
    values_data.account_type,
    values_data.direction,
    values_data.balance,
    values_data.annual_rate_percent,
    values_data.account_number_mask,
    values_data.iban_mask,
    values_data.notes
  from selected_user su
  join all_partners ap on ap.user_id = su.user_id
  join (
    values
      (
        'ČSOB',
        'BANK',
        'ČSOB sample current account',
        'CURRENT',
        'ASSET',
        100000.00::numeric,
        0.00::numeric,
        '****0300',
        'CZ**0300************',
        'Sample regular bank account with manually entered balance.'
      ),
      (
        'Raiffeisenbank',
        'BANK',
        'Raiffeisenbank sample savings account',
        'SAVINGS',
        'ASSET',
        200000.00::numeric,
        4.10::numeric,
        '****5500',
        'CZ**5500************',
        'Sample savings account with manually entered balance and illustrative interest rate.'
      ),
      (
        'Raiffeisenbank',
        'BANK',
        'Raiffeisenbank reserve savings account',
        'SAVINGS',
        'ASSET',
        450000.00::numeric,
        4.10::numeric,
        '****5500',
        'CZ**5500************',
        'Additional sample Raiffeisenbank savings account with manually entered balance.'
      ),
      (
        'UniCredit Bank CZ',
        'BANK',
        'UniCredit sample mortgage',
        'MORTGAGE',
        'LIABILITY',
        800000.00::numeric,
        0.00::numeric,
        '****2700',
        'CZ**2700************',
        'Sample mortgage with current principal balance and planned monthly installment.'
      ),
      (
        'Pavel Vaněček',
        'BORROWER',
        'Personal loan to Pavel Vaněček',
        'PRIVATE_LOAN',
        'RECEIVABLE',
        100000.00::numeric,
        0.00::numeric,
        null,
        null,
        'Sample personal loan receivable to Pavel Vaněček.'
      )
  ) as values_data(
    partner_name,
    provider_role,
    account_name,
    account_type,
    direction,
    balance,
    annual_rate_percent,
    account_number_mask,
    iban_mask,
    notes
  ) on values_data.partner_name = ap.display_name
  join all_roles ar
    on ar.partner_id = ap.id
   and ar.role = values_data.provider_role
),
inserted_accounts as (
  insert into public.financial_accounts (
    user_id,
    provider_partner_role_id,
    name,
    account_type,
    direction,
    currency,
    opening_date,
    account_number_mask,
    iban_mask,
    include_in_net_worth,
    notes,
    metadata
  )
  select
    user_id,
    provider_partner_role_id,
    account_name,
    account_type,
    direction,
    'CZK',
    current_date,
    account_number_mask,
    iban_mask,
    true,
    notes,
    jsonb_build_object('seed_sample', true, 'sample_balance', balance)
  from seed_accounts sa
  where not exists (
    select 1
    from public.financial_accounts fa
    where fa.user_id = sa.user_id
      and lower(fa.name) = lower(sa.account_name)
  )
  returning id, user_id, name
),
all_accounts as (
  select ia.id, ia.user_id, ia.name, sa.balance, sa.annual_rate_percent
  from inserted_accounts ia
  join seed_accounts sa
    on sa.user_id = ia.user_id
   and sa.account_name = ia.name
  union all
  select fa.id, fa.user_id, fa.name, sa.balance, sa.annual_rate_percent
  from public.financial_accounts fa
  join seed_accounts sa
    on sa.user_id = fa.user_id
   and lower(sa.account_name) = lower(fa.name)
),
seed_credit_facilities as (
  select
    aa.id as account_id,
    ar.id as counterparty_partner_role_id,
    values_data.facility_type,
    values_data.facility_direction,
    values_data.principal_amount,
    values_data.current_principal,
    values_data.monthly_payment,
    values_data.payment_day,
    values_data.start_date,
    values_data.target_end_date,
    values_data.interest_rate_percent,
    values_data.notes
  from all_accounts aa
  join (
    values
      (
        'UniCredit sample mortgage',
        'UniCredit Bank CZ',
        'LENDER',
        'MORTGAGE',
        'BORROWED',
        800000.00::numeric,
        800000.00::numeric,
        9100.00::numeric,
        15,
        current_date,
        null::date,
        null::numeric,
        'Sample UniCredit mortgage: current balance 800,000 CZK and monthly installment 9,100 CZK.'
      ),
      (
        'Personal loan to Pavel Vaněček',
        'Pavel Vaněček',
        'BORROWER',
        'PRIVATE_LOAN',
        'LENT',
        100000.00::numeric,
        100000.00::numeric,
        null::numeric,
        null::integer,
        current_date,
        null::date,
        null::numeric,
        'Sample personal loan receivable to Pavel Vaněček, Praha 7.'
      )
  ) as values_data(
    account_name,
    partner_name,
    counterparty_role,
    facility_type,
    facility_direction,
    principal_amount,
    current_principal,
    monthly_payment,
    payment_day,
    start_date,
    target_end_date,
    interest_rate_percent,
    notes
  ) on values_data.account_name = aa.name
  join all_partners ap on ap.display_name = values_data.partner_name
  join all_roles ar
    on ar.partner_id = ap.id
   and ar.role = values_data.counterparty_role
),
inserted_credit_facilities as (
  insert into public.credit_facilities (
    account_id,
    counterparty_partner_role_id,
    facility_type,
    facility_direction,
    principal_amount,
    current_principal,
    monthly_payment,
    payment_day,
    start_date,
    target_end_date,
    interest_rate_percent,
    notes,
    metadata
  )
  select
    account_id,
    counterparty_partner_role_id,
    facility_type,
    facility_direction,
    principal_amount,
    current_principal,
    monthly_payment,
    payment_day,
    start_date,
    target_end_date,
    interest_rate_percent,
    notes,
    '{"seed_sample":true}'::jsonb
  from seed_credit_facilities scf
  where not exists (
    select 1
    from public.credit_facilities cf
    where cf.account_id = scf.account_id
      and cf.facility_type = scf.facility_type
      and cf.facility_direction = scf.facility_direction
  )
  returning id
),
inserted_snapshots as (
  insert into public.account_balance_snapshots (
    account_id,
    balance_date,
    balance,
    currency,
    source,
    notes
  )
  select
    aa.id,
    current_date,
    aa.balance,
    'CZK',
    'MANUAL',
    'Seed sample balance entered for Accounts module UI testing.'
  from all_accounts aa
  where not exists (
    select 1
    from public.account_balance_snapshots abs
    where abs.account_id = aa.id
      and abs.balance_date = current_date
      and abs.source = 'MANUAL'
  )
  returning id
),
inserted_rates as (
  insert into public.account_rate_periods (
    account_id,
    rate_type,
    annual_rate_percent,
    valid_from,
    capitalization_period,
    notes
  )
  select
    aa.id,
    'SAVINGS_INTEREST',
    aa.annual_rate_percent,
    current_date,
    'MONTHLY',
    'Illustrative sample rate for UI testing; verify actual product rate before using for planning.'
  from all_accounts aa
  where aa.annual_rate_percent > 0
    and not exists (
      select 1
      from public.account_rate_periods arp
      where arp.account_id = aa.id
        and arp.rate_type = 'SAVINGS_INTEREST'
        and arp.valid_to is null
    )
  returning id
)
select
  (select count(*) from all_partners) as partners_ready,
  (select count(*) from all_roles) as partner_roles_ready,
  (select count(*) from all_accounts) as financial_accounts_ready,
  (select count(*) from inserted_credit_facilities) as credit_facilities_inserted,
  (select count(*) from inserted_snapshots) as balance_snapshots_inserted,
  (select count(*) from inserted_rates) as rate_periods_inserted;

commit;
