alter table public.assets
add column isin text;

alter table public.assets
add constraint assets_isin_format check (
  isin is null
  or isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'
);

create unique index assets_isin_key
on public.assets (isin)
where isin is not null;

create index assets_symbol_provider_search_idx
on public.assets (lower(symbol), lower(provider_symbol));
