import { NextResponse } from "next/server";
import { getCurrentPfpUser, type CurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssetHistoryRange = "1D" | "1W" | "1M" | "YTD" | "1Y" | "5Y" | "10Y" | "ALL";

type AssetRow = {
  id: string;
  symbol: string;
  name: string | null;
  currency: string;
  provider_symbol: string | null;
};

type DailyPriceRow = {
  date: string;
  open: string | number | null;
  high: string | number | null;
  low: string | number | null;
  close: string | number;
  adjusted_close: string | number | null;
  volume: string | number | null;
  currency: string;
};

type PortfolioCurrencyRow = {
  base_currency: string;
};

type FxRateRow = {
  rate_date: string;
  rate: string | number;
};

type AssetHistoryPoint = ReturnType<typeof pointFromDailyPrice>;

type YahooChartResult = {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        regularMarketTime?: number;
        exchangeTimezoneName?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      description?: string;
    } | null;
  };
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

function normalizeRange(value: string | null): AssetHistoryRange {
  if (
    value === "1D" ||
    value === "1W" ||
    value === "1M" ||
    value === "YTD" ||
    value === "1Y" ||
    value === "5Y" ||
    value === "10Y" ||
    value === "ALL"
  ) {
    return value;
  }

  return "1Y";
}

function normalizeCurrency(value: string | null) {
  const currency = value?.trim().toUpperCase();

  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function subtractRange(date: Date, range: AssetHistoryRange) {
  const start = new Date(date);

  if (range === "1W") {
    start.setUTCDate(start.getUTCDate() - 7);
  }

  if (range === "1M") {
    start.setUTCMonth(start.getUTCMonth() - 1);
  }

  if (range === "1Y") {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
  }

  if (range === "5Y") {
    start.setUTCFullYear(start.getUTCFullYear() - 5);
  }

  if (range === "10Y") {
    start.setUTCFullYear(start.getUTCFullYear() - 10);
  }

  return start;
}

function pointFromDailyPrice(row: DailyPriceRow) {
  const close = toNumber(row.adjusted_close ?? row.close) ?? 0;
  const rawClose = toNumber(row.close) ?? close;
  const open = toNumber(row.open) ?? rawClose;
  const high = toNumber(row.high) ?? Math.max(open, rawClose);
  const low = toNumber(row.low) ?? Math.min(open, rawClose);

  return {
    date: row.date,
    label: row.date,
    open,
    high,
    low,
    close,
    rawClose,
    volume: toNumber(row.volume),
  };
}

function fxRateAtOrBefore(rates: FxRateRow[], targetDate: string) {
  return rates.find((rate) => rate.rate_date <= targetDate);
}

async function getPortfolioCurrency(assetId: string, user: CurrentPfpUser) {
  const pool = createPostgresPool();

  if (!pool) {
    return null;
  }

  const portfolioCurrencyResult = await pool.query<PortfolioCurrencyRow>(
    `
    select p.base_currency::text as base_currency
    from public.transactions t
    join public.portfolios p on p.id = t.portfolio_id
    where t.asset_id = $1::uuid
      and p.user_id = $2::uuid
    order by t.trade_date asc
    limit 1
    `,
    [assetId, user.dataUserId],
  );

  return portfolioCurrencyResult.rows[0]?.base_currency ?? null;
}

async function convertDailyPoints({
  assetCurrency,
  requestedCurrency,
  points,
}: {
  assetCurrency: string;
  requestedCurrency: string;
  points: AssetHistoryPoint[];
}) {
  const pool = createPostgresPool();

  if (!pool || assetCurrency === requestedCurrency || points.length === 0) {
    return {
      currency: assetCurrency,
      points,
      delayNotice: assetCurrency === requestedCurrency ? null : "FX conversion unavailable.",
    };
  }

  const startDate = points[0].date;
  const directRatesResult = await pool.query<FxRateRow>(
    `
    select rate_date::text as rate_date, rate
    from public.fx_rates
    where from_currency = $1::char(3)
      and to_currency = $2::char(3)
      and rate_date >= $3::date - interval '7 days'
    order by rate_date desc
    `,
    [assetCurrency, requestedCurrency, startDate],
  );
  const inverseRatesResult =
    directRatesResult.rows.length > 0
      ? { rows: [] as FxRateRow[] }
      : await pool.query<FxRateRow>(
          `
          select rate_date::text as rate_date, rate
          from public.fx_rates
          where from_currency = $1::char(3)
            and to_currency = $2::char(3)
            and rate_date >= $3::date - interval '7 days'
          order by rate_date desc
          `,
          [requestedCurrency, assetCurrency, startDate],
        );
  const convertedPoints = points.flatMap((point) => {
    const directRate = fxRateAtOrBefore(directRatesResult.rows, point.date);
    const inverseRate = fxRateAtOrBefore(inverseRatesResult.rows, point.date);
    const rate = toNumber(directRate?.rate);
    const inverse = toNumber(inverseRate?.rate);
    const conversion = rate ?? (inverse && inverse > 0 ? 1 / inverse : null);

    if (!conversion) {
      return [];
    }

    return [
      {
        ...point,
        open: point.open * conversion,
        high: point.high * conversion,
        low: point.low * conversion,
        close: point.close * conversion,
        rawClose: point.rawClose * conversion,
      },
    ];
  });

  return {
    currency: convertedPoints.length > 0 ? requestedCurrency : assetCurrency,
    points: convertedPoints.length > 0 ? convertedPoints : points,
    delayNotice:
      convertedPoints.length > 0
        ? `Prices converted from ${assetCurrency} to ${requestedCurrency} using stored daily FX rates.`
        : `No stored FX rates found for ${assetCurrency}/${requestedCurrency}; showing ${assetCurrency}.`,
  };
}

async function fetchYahooIntraday(asset: AssetRow) {
  const symbol = asset.provider_symbol ?? asset.symbol;
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);

  url.searchParams.set("range", "1d");
  url.searchParams.set("interval", "5m");
  url.searchParams.set("includePrePost", "false");

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "user-agent": "PF Planner local MVP",
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance intraday request failed with ${response.status}`);
  }

  const payload = (await response.json()) as YahooChartResult;
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];

  if (!quote || timestamps.length === 0) {
    throw new Error(payload.chart?.error?.description ?? "Yahoo Finance returned no intraday points");
  }

  const points = timestamps
    .map((timestamp, index) => {
      const close = quote.close?.[index] ?? null;

      if (close === null) {
        return null;
      }

      const open = quote.open?.[index] ?? close;
      const high = quote.high?.[index] ?? Math.max(open, close);
      const low = quote.low?.[index] ?? Math.min(open, close);
      const date = new Date(timestamp * 1000);

      return {
        date: date.toISOString(),
        label: date.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: result.meta?.exchangeTimezoneName ?? "UTC",
        }),
        open,
        high,
        low,
        close,
        rawClose: close,
        volume: quote.volume?.[index] ?? null,
      };
    })
    .filter((point): point is NonNullable<typeof point> => point !== null);

  return {
    source: "yahoo-intraday",
    currency: result.meta?.currency ?? asset.currency,
    delayNotice:
      "Intraday prices use the Yahoo Finance chart endpoint and may be delayed versus the exchange feed.",
    latestMarketTime: result.meta?.regularMarketTime
      ? new Date(result.meta.regularMarketTime * 1000).toISOString()
      : null,
    points,
  };
}

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  const auth = await getCurrentPfpUser();

  if (auth.status !== "authenticated") {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status === "forbidden" ? 403 : 401, headers: { "cache-control": "no-store" } },
    );
  }

  const { assetId } = await context.params;
  const url = new URL(request.url);
  const range = normalizeRange(url.searchParams.get("range"));
  const requestedCurrency = normalizeCurrency(url.searchParams.get("currency"));
  const pool = createPostgresPool();

  if (!pool || assetId.startsWith("demo-")) {
    if (!auth.user.isLocalBypass && !assetId.startsWith("demo-")) {
      return NextResponse.json(
        { error: "Missing database connection for asset history." },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        asset: {
          id: assetId,
          symbol: assetId.replace(/^demo-/, ""),
          name: assetId.replace(/^demo-/, ""),
        },
        range,
        source: "demo",
        currency: "USD",
        delayNotice: range === "1D" ? "Demo intraday prices are generated locally." : null,
        points: Array.from({ length: 48 }).map((_, index) => {
          const close = 100 + index * 0.6 + Math.sin(index / 3) * 3;
          return {
            date: `demo-${index}`,
            label: `${index + 1}`,
            open: close - 0.7,
            high: close + 1.2,
            low: close - 1.4,
            close,
            rawClose: close,
            volume: null,
          };
        }),
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const assetResult = await pool.query<AssetRow>(
    `
    select a.id, a.symbol, a.name, a.currency::text as currency, a.provider_symbol
    from public.assets a
    where a.id = $1::uuid
      and exists (
        select 1
        from public.transactions t
        join public.portfolios p on p.id = t.portfolio_id
        where t.asset_id = a.id
          and p.user_id = $2::uuid
      )
    limit 1
    `,
    [assetId, auth.user.dataUserId],
  );
  const asset = assetResult.rows[0];

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (range === "1D") {
    const portfolioCurrency = await getPortfolioCurrency(assetId, auth.user);

    try {
      const intraday = await fetchYahooIntraday(asset);
      const intradayCurrency = intraday.currency;
      const targetCurrency =
        requestedCurrency && (requestedCurrency === intradayCurrency || requestedCurrency === portfolioCurrency)
          ? requestedCurrency
          : intradayCurrency;
      const converted = await convertDailyPoints({
        assetCurrency: intradayCurrency,
        requestedCurrency: targetCurrency,
        points: intraday.points,
      });
      const delayNotice = [intraday.delayNotice, converted.delayNotice].filter(Boolean).join(" ");

      return NextResponse.json(
        {
          asset,
          range,
          ...intraday,
          currency: converted.currency,
          assetCurrency: intradayCurrency,
          portfolioCurrency,
          delayNotice,
          points: converted.points,
        },
        { headers: { "cache-control": "no-store" } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Intraday source failed";
      return NextResponse.json(
        {
          asset,
          range,
          source: "database",
          currency: asset.currency,
          assetCurrency: asset.currency,
          portfolioCurrency,
          delayNotice: `Intraday source unavailable (${message}); showing latest stored daily points.`,
          points: [],
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
  }

  const firstBuyResult = await pool.query<{ first_buy_date: string | null }>(
    `
    select min(trade_date)::text as first_buy_date
    from public.transactions t
    join public.portfolios p on p.id = t.portfolio_id
    where t.asset_id = $1::uuid
      and p.user_id = $2::uuid
      and t.type = 'BUY'
    `,
    [assetId, auth.user.dataUserId],
  );
  const firstBuyDate = firstBuyResult.rows[0]?.first_buy_date;
  let startDate: string | null = null;
  const today = new Date();
  const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  if (range === "YTD") {
    startDate = `${todayDate.getUTCFullYear()}-01-01`;
  } else if (range !== "ALL") {
    startDate = dateKey(subtractRange(todayDate, range));
  } else if (range === "ALL") {
    startDate = firstBuyDate;
  }

  const pricesResult = await pool.query<DailyPriceRow>(
    `
    select
      price_date::text as date,
      open,
      high,
      low,
      close,
      adjusted_close,
      volume,
      currency::text as currency
    from public.daily_prices
    where asset_id = $1::uuid
      and ($2::date is null or price_date >= $2::date)
      and price_date <= current_date
    order by price_date asc
    `,
    [assetId, startDate],
  );
  const assetCurrency = pricesResult.rows[0]?.currency ?? asset.currency;
  const portfolioCurrency = await getPortfolioCurrency(assetId, auth.user);
  const targetCurrency =
    requestedCurrency && (requestedCurrency === assetCurrency || requestedCurrency === portfolioCurrency)
      ? requestedCurrency
      : assetCurrency;
  const converted = await convertDailyPoints({
    assetCurrency,
    requestedCurrency: targetCurrency,
    points: pricesResult.rows.map(pointFromDailyPrice),
  });

  return NextResponse.json(
    {
      asset,
      range,
      source: "database",
      currency: converted.currency,
      portfolioCurrency,
      assetCurrency,
      delayNotice: converted.delayNotice,
      points: converted.points,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
