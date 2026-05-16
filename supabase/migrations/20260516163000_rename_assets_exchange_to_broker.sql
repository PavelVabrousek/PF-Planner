alter table public.assets
rename column exchange to broker;

alter table public.assets
rename constraint assets_exchange_not_blank to assets_broker_not_blank;

alter index if exists public.assets_exchange_symbol_key
rename to assets_broker_symbol_key;
