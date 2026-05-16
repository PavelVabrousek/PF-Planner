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
  const assetsResult = await pool.query<AssetSearchRow>(
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
  );

  return NextResponse.json(
    {
      assets: assetsResult.rows.map((asset) => ({
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
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
