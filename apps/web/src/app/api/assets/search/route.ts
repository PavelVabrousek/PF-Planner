import { NextResponse } from "next/server";
import { getCurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssetSearchRow = {
  id: string;
  symbol: string;
  isin: string | null;
  name: string | null;
  broker: string;
  currency: string;
  asset_type: string;
  provider_symbol: string | null;
  latest_price: string | number | null;
  latest_price_date: string | null;
  latest_price_currency: string | null;
};

type YahooSearchQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  exchDisp?: string;
  currency?: string;
  quoteType?: string;
  regularMarketPrice?: number;
};

type NfinSearchRow = {
  symbol?: string;
  name?: string;
  exchange?: string;
  asset?: string;
  subCategory?: string | null;
  region?: string | null;
};

type AssetSearchResult = {
  id: string | null;
  symbol: string;
  isin: string | null;
  name: string | null;
  broker: string;
  currency: string;
  assetType: string;
  providerSymbol: string | null;
  latestPrice: number | null;
  latestPriceDate: string | null;
  latestPriceCurrency: string;
  source: "database" | "nfin" | "yahoo";
};

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function assetTypeFromQuote(quoteType: string | undefined) {
  const normalized = quoteType?.toUpperCase();

  if (normalized === "ETF") {
    return "ETF";
  }

  if (normalized === "CRYPTOCURRENCY") {
    return "CRYPTO";
  }

  return "STOCK";
}

function assetTypeFromNfin(asset: string | undefined) {
  const normalized = asset?.toUpperCase();

  if (normalized === "ETF") {
    return "ETF";
  }

  if (normalized === "STOCKS") {
    return "STOCK";
  }

  return null;
}

function searchAliases(query: string) {
  const normalized = query.trim().toLowerCase();
  const aliases: Record<string, string[]> = {
    facebook: ["meta"],
    google: ["alphabet"],
  };

  return aliases[normalized] ?? [];
}

function rankSearchResult(asset: AssetSearchResult, query: string, aliases: string[] = []) {
  const normalizedQuery = query.toUpperCase();
  const symbol = asset.symbol.toUpperCase();
  const name = asset.name?.toUpperCase() ?? "";
  const normalizedAliases = aliases.map((alias) => alias.toUpperCase());

  if (symbol === normalizedQuery) {
    return 0;
  }

  if (symbol.startsWith(normalizedQuery)) {
    return 1;
  }

  if (asset.assetType === "STOCK" && normalizedAliases.some((alias) => name.includes(alias))) {
    return 1.5;
  }

  if (name.includes(normalizedQuery)) {
    return 2;
  }

  return 3;
}

async function searchNfinAssets(query: string): Promise<AssetSearchResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  const aliases = searchAliases(query);
  const queries = [query, ...aliases];

  try {
    const payloads = await Promise.all(
      queries.map(async (searchQuery) => {
        const url = new URL("https://api.nfin.dev/v1/search");
        url.searchParams.set("q", searchQuery);
        const response = await fetch(url, {
          headers: { accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          return [] as NfinSearchRow[];
        }

        const payload = (await response.json()) as { data?: { data?: NfinSearchRow[] } };
        return payload.data?.data ?? [];
      }),
    );

    return payloads
      .flat()
      .flatMap((row): AssetSearchResult[] => {
        const assetType = assetTypeFromNfin(row.asset);
        const subCategory = row.subCategory?.toUpperCase() ?? "";

        if (!row.symbol || !assetType || subCategory.includes("DEBT") || subCategory.includes("NOTE")) {
          return [];
        }

        return [
          {
            id: null,
            symbol: row.symbol.toUpperCase(),
            isin: null,
            name: row.name ?? null,
            broker: row.exchange || "NASDAQ",
            currency: "USD",
            assetType,
            providerSymbol: row.symbol.toUpperCase(),
            latestPrice: null,
            latestPriceDate: null,
            latestPriceCurrency: "USD",
            source: "nfin",
          },
        ];
      })
      .sort((left, right) => rankSearchResult(left, query, aliases) - rankSearchResult(right, query, aliases));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function searchYahooAssets(query: string): Promise<AssetSearchResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", query);
  url.searchParams.set("quotesCount", "8");
  url.searchParams.set("newsCount", "0");

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { quotes?: YahooSearchQuote[] };

    return (payload.quotes ?? [])
      .filter((quote) => quote.symbol && quote.currency)
      .map((quote) => ({
        id: null,
        symbol: quote.symbol?.toUpperCase() ?? "",
        isin: null,
        name: quote.longname ?? quote.shortname ?? null,
        broker: quote.exchange ?? quote.exchDisp ?? "YAHOO",
        currency: quote.currency?.toUpperCase() ?? "USD",
        assetType: assetTypeFromQuote(quote.quoteType),
        providerSymbol: quote.symbol ?? null,
        latestPrice: toNumber(quote.regularMarketPrice),
        latestPriceDate: null,
        latestPriceCurrency: quote.currency?.toUpperCase() ?? "USD",
        source: "yahoo",
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const auth = await getCurrentPfpUser();

  if (auth.status !== "authenticated") {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status === "forbidden" ? 403 : 401, headers: { "cache-control": "no-store" } },
    );
  }

  const pool = createPostgresPool();

  if (!pool) {
    return NextResponse.json(
      { error: "Missing database connection." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ assets: [] }, { headers: { "cache-control": "no-store" } });
  }

  const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const [assetsResult, nfinAssets, yahooAssets] = await Promise.all([
    pool.query<AssetSearchRow>(
    `
    with latest_prices as (
      select distinct on (asset_id)
        asset_id,
        coalesce(adjusted_close, close) as latest_price,
        price_date::text as latest_price_date,
        currency::text as latest_price_currency
      from public.daily_prices
      order by asset_id, price_date desc
    )
    select
      a.id,
      a.symbol,
      a.isin,
      a.name,
      a.broker,
      a.currency::text as currency,
      a.asset_type,
      a.provider_symbol,
      lp.latest_price,
      lp.latest_price_date,
      lp.latest_price_currency
    from public.assets a
    left join latest_prices lp on lp.asset_id = a.id
    where a.is_active = true
      and (
        a.symbol ilike $1 escape '\\'
        or a.provider_symbol ilike $1 escape '\\'
        or a.name ilike $1 escape '\\'
        or a.isin ilike $1 escape '\\'
      )
    order by
      case
        when upper(a.symbol) = upper($2) then 0
        when upper(coalesce(a.isin, '')) = upper($2) then 1
        when upper(coalesce(a.provider_symbol, '')) = upper($2) then 2
        else 3
      end,
      a.symbol
    limit 12
    `,
    [pattern, query],
    ),
    searchNfinAssets(query),
    searchYahooAssets(query),
  ]);
  const databaseAssets: AssetSearchResult[] = assetsResult.rows.map((asset) => ({
    id: asset.id,
    symbol: asset.symbol,
    isin: asset.isin,
    name: asset.name,
    broker: asset.broker,
    currency: asset.currency,
    assetType: asset.asset_type,
    providerSymbol: asset.provider_symbol,
    latestPrice: toNumber(asset.latest_price),
    latestPriceDate: asset.latest_price_date,
    latestPriceCurrency: asset.latest_price_currency ?? asset.currency,
    source: "database",
  }));
  const seen = new Set(databaseAssets.map((asset) => `${asset.broker}|${asset.symbol}`.toUpperCase()));
  const mergedAssets = [
    ...databaseAssets,
    ...nfinAssets.filter((asset) => {
      const key = `${asset.broker}|${asset.symbol}`.toUpperCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }),
    ...yahooAssets.filter((asset) => {
      const key = `${asset.broker}|${asset.symbol}`.toUpperCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }),
  ].slice(0, 12);

  return NextResponse.json(
    {
      assets: mergedAssets,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
