import { NextResponse } from "next/server";
import { getCurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssetRow = {
  id: string;
  symbol: string;
  currency: string;
  provider_symbol: string | null;
};

type DailyPriceRow = {
  price_date: string;
  close: string | number;
  adjusted_close: string | number | null;
  currency: string;
};

type FxRateRow = {
  rate_date: string;
  rate: string | number;
};

type PortfolioRow = {
  base_currency: string;
};

type YahooChartResult = {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        regularMarketPrice?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
        adjclose?: Array<{
          adjclose?: Array<number | null>;
        }>;
      };
    }>;
  };
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

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

function currencyCode(value: string | null) {
  const currency = value?.trim().toUpperCase() ?? "";

  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function dateKey(value: string | null) {
  const date = value?.trim() ?? "";

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function unixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

async function latestRate(
  pool: NonNullable<ReturnType<typeof createPostgresPool>>,
  from: string,
  to: string,
  targetDate: string,
) {
  const result = await pool.query<FxRateRow>(
    `
    select rate_date::text as rate_date, rate
    from public.fx_rates
    where from_currency = $1::char(3)
      and to_currency = $2::char(3)
      and rate_date <= $3::date
    order by rate_date desc
    limit 1
    `,
    [from, to, targetDate],
  );

  return result.rows[0] ?? null;
}

async function conversionRate(
  pool: NonNullable<ReturnType<typeof createPostgresPool>>,
  from: string,
  to: string,
  targetDate: string,
  pivot?: string,
) {
  if (from === to) {
    return { rate: 1, source: "same_currency" };
  }

  const direct = await latestRate(pool, from, to, targetDate);
  const directRate = toNumber(direct?.rate);

  if (directRate && directRate > 0) {
    return { rate: directRate, source: "direct" };
  }

  const inverse = await latestRate(pool, to, from, targetDate);
  const inverseRate = toNumber(inverse?.rate);

  if (inverseRate && inverseRate > 0) {
    return { rate: 1 / inverseRate, source: "inverse" };
  }

  if (pivot && pivot !== from && pivot !== to) {
    const fromToPivot = await latestRate(pool, from, pivot, targetDate);
    const toToPivot = await latestRate(pool, to, pivot, targetDate);
    const fromRate = toNumber(fromToPivot?.rate);
    const toRate = toNumber(toToPivot?.rate);

    if (fromRate && toRate && fromRate > 0 && toRate > 0) {
      return { rate: fromRate / toRate, source: "pivot" };
    }
  }

  return null;
}

async function fetchYahooPrice(symbol: string, targetDate: string) {
  const isToday = targetDate === todayKey();
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);

  if (isToday) {
    url.searchParams.set("range", "1d");
    url.searchParams.set("interval", "1d");
  } else {
    const date = new Date(`${targetDate}T00:00:00Z`);
    const period1 = new Date(date);
    const period2 = new Date(date);
    period1.setUTCDate(period1.getUTCDate() - 7);
    period2.setUTCDate(period2.getUTCDate() + 1);
    url.searchParams.set("period1", String(unixSeconds(period1)));
    url.searchParams.set("period2", String(unixSeconds(period2)));
    url.searchParams.set("interval", "1d");
    url.searchParams.set("includeAdjustedClose", "true");
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: { "user-agent": "PF Planner local MVP" },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as YahooChartResult;
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const adjclose = result?.indicators?.adjclose?.[0]?.adjclose;
  const points = timestamps.flatMap((timestamp, index) => {
    const close = adjclose?.[index] ?? quote?.close?.[index] ?? null;

    if (close === null) {
      return [];
    }

    return [
      {
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        price: close,
      },
    ];
  });
  const point = isToday
    ? points.at(-1)
    : [...points].reverse().find((item) => item.date <= targetDate);
  const metaPrice = toNumber(result?.meta?.regularMarketPrice);
  const price = point?.price ?? (isToday ? metaPrice : null);

  if (!price || price <= 0) {
    return null;
  }

  return {
    price,
    priceDate: point?.date ?? targetDate,
    currency: result?.meta?.currency?.toUpperCase() ?? "USD",
    source: isToday ? "yahoo-current" : "yahoo-history",
  };
}

export async function GET(request: Request) {
  const auth = await getCurrentPfpUser();

  if (auth.status !== "authenticated") {
    return jsonError(auth.message, auth.status === "forbidden" ? 403 : 401);
  }

  const pool = createPostgresPool();

  if (!pool) {
    return jsonError("Missing database connection.", 503);
  }

  const url = new URL(request.url);
  const assetId = url.searchParams.get("assetId")?.trim() ?? "";
  const providerSymbol = url.searchParams.get("providerSymbol")?.trim() || url.searchParams.get("symbol")?.trim() || "";
  const date = dateKey(url.searchParams.get("date")) ?? todayKey();
  const requestedCurrency = currencyCode(url.searchParams.get("currency"));
  let asset: AssetRow | null = null;
  const portfolioResult = await pool.query<PortfolioRow>(
    `
    select base_currency::text as base_currency
    from public.portfolios
    where user_id = $1::uuid
      and is_archived = false
    order by created_at asc
    limit 1
    `,
    [auth.user.dataUserId],
  );
  const portfolioCurrency = portfolioResult.rows[0]?.base_currency;

  if (assetId) {
    const assetResult = await pool.query<AssetRow>(
      `
      select id, symbol, currency::text as currency, provider_symbol
      from public.assets
      where id = $1::uuid
      limit 1
      `,
      [assetId],
    );
    asset = assetResult.rows[0] ?? null;
  }

  const symbol = providerSymbol || asset?.provider_symbol || asset?.symbol;

  if (!symbol) {
    return jsonError("Asset symbol is required.");
  }

  const isToday = date === todayKey();
  let price:
    | {
        price: number;
        priceDate: string;
        currency: string;
        source: string;
      }
    | null = isToday ? await fetchYahooPrice(symbol, date) : null;

  if (!price && asset?.id) {
    const priceResult = await pool.query<DailyPriceRow>(
      `
      select price_date::text as price_date, close, adjusted_close, currency::text as currency
      from public.daily_prices
      where asset_id = $1::uuid
        and price_date <= $2::date
      order by price_date desc
      limit 1
      `,
      [asset.id, date],
    );
    const row = priceResult.rows[0];
    const value = toNumber(row?.adjusted_close ?? row?.close);

    if (row && value && value > 0) {
      price = {
        price: value,
        priceDate: row.price_date,
        currency: row.currency,
        source: "database",
      };
    }
  }

  if (!price) {
    price = await fetchYahooPrice(symbol, date);
  }

  if (!price) {
    return jsonError(`No price found for ${symbol} on or before ${date}.`, 404);
  }

  const targetCurrency = requestedCurrency ?? price.currency;
  let convertedPrice = price.price;
  let fxSource: string | null = null;

  if (targetCurrency !== price.currency) {
    const rate = await conversionRate(pool, price.currency, targetCurrency, price.priceDate, portfolioCurrency);

    if (!rate) {
      return jsonError(`No FX rate found for ${price.currency} to ${targetCurrency} on or before ${price.priceDate}.`, 404);
    }

    convertedPrice = price.price * rate.rate;
    fxSource = rate.source;
  }

  return NextResponse.json(
    {
      price: convertedPrice,
      priceDate: price.priceDate,
      currency: targetCurrency,
      source: price.source,
      nativePrice: price.price,
      nativeCurrency: price.currency,
      fxSource,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
