import { Pool } from "pg";
import { createPostgresPool } from "@/lib/db/postgres";

type AssetRow = {
  id: string;
  symbol: string;
  exchange: string;
  name: string | null;
  currency: string;
  asset_type: string;
  data_provider: string | null;
  provider_symbol: string | null;
};

type PortfolioAssetRow = AssetRow & {
  portfolio_id: string;
  portfolio_name: string;
  base_currency: string;
  first_trade_date: string;
  latest_price_date: string | null;
};

type DailyPriceInput = {
  assetId: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adjustedClose: number | null;
  volume: number | null;
  currency: string;
  source: string;
};

type CorporateActionInput = {
  assetId: string;
  type: "DIVIDEND" | "SPLIT";
  exDate: string;
  payDate: string | null;
  amount: number | null;
  ratio: number | null;
  currency: string | null;
  source: string;
  metadata: Record<string, unknown>;
};

export type RecalculateSummary = {
  portfolioName: string;
  assetsScanned: number;
  assetsUpdated: number;
  dailyPricesUpserted: number;
  corporateActionsUpserted: number;
  fxRatesUpserted: number;
  warnings: string[];
};

export type RecalculateProgressEvent =
  | {
      type: "start";
      portfolioName: string;
      totalAssets: number;
    }
  | {
      type: "asset-start";
      symbol: string;
      index: number;
      totalAssets: number;
    }
  | {
      type: "asset-complete";
      symbol: string;
      index: number;
      totalAssets: number;
      providerSymbol: string | null;
      dailyPricesUpserted: number;
      corporateActionsUpserted: number;
    }
  | {
      type: "asset-warning";
      symbol: string;
      index: number;
      totalAssets: number;
      warning: string;
    }
  | {
      type: "fx-start";
      currencies: string[];
    }
  | {
      type: "fx-complete";
      fxRatesUpserted: number;
    }
  | {
      type: "complete";
      summary: RecalculateSummary;
    };

type RecalculateProgressHandler = (event: RecalculateProgressEvent) => void | Promise<void>;

export type RecalculateMode = "full" | "incremental";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HISTORY_DAYS = 365 * 10 + 14;
const YAHOO_SOURCE = "yahoo_chart";
const STOOQ_SOURCE = "stooq";
const ECB_SOURCE = "ECB";
const INSERT_CHUNK_SIZE = 500;
const YAHOO_SYMBOL_OVERRIDES: Record<string, string> = {
  DTE: "DTE.DE",
  KBC: "KBC.BR",
  NOVN: "NOVN.SW",
  "NOVO-B": "NOVO-B.CO",
  PEO: "PEO.WA",
  UBSG: "UBSG.SW",
};

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function compactDate(date: Date) {
  return formatDate(date).replaceAll("-", "");
}

function toUnixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function getDateRange() {
  const end = new Date();
  const start = new Date(end.getTime() - DEFAULT_HISTORY_DAYS * DAY_MS);

  return {
    start,
    end,
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

function earlierDate(left: Date, right: Date) {
  return left.getTime() <= right.getTime() ? left : right;
}

function parseTradeDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function getIncrementalStartDate(latestDate: string | null, fallbackStart: Date) {
  if (!latestDate) {
    return fallbackStart;
  }

  const nextDate = new Date(`${latestDate}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  return nextDate;
}

function isAfterEndDate(start: Date, end: Date) {
  return formatDate(start) > formatDate(end);
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCurrency(value: string | null | undefined) {
  const currency = value?.trim().toUpperCase();

  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }

  return result;
}

function getTickerCandidates(asset: AssetRow) {
  const symbols = new Set<string>();
  const baseSymbol = (asset.provider_symbol || asset.symbol).trim().toUpperCase();
  const importSymbol = asset.symbol.trim().toUpperCase();
  const suffixBaseSymbol = baseSymbol.includes(".") ? importSymbol : baseSymbol;

  if (!baseSymbol) {
    return [];
  }

  const override = YAHOO_SYMBOL_OVERRIDES[importSymbol] ?? YAHOO_SYMBOL_OVERRIDES[baseSymbol];

  if (override) {
    symbols.add(override);
  }

  symbols.add(baseSymbol);

  if (asset.asset_type === "CRYPTO" && baseSymbol === "BTC") {
    symbols.add("BTC-USD");
  }

  if (asset.currency === "DKK" && suffixBaseSymbol.includes("-")) {
    symbols.add(`${suffixBaseSymbol}.CO`);
  }

  if (asset.currency === "EUR") {
    symbols.add(`${suffixBaseSymbol}.DE`);
    symbols.add(`${suffixBaseSymbol}.AS`);
  }

  if (asset.currency === "CHF") {
    symbols.add(`${suffixBaseSymbol}.SW`);
  }

  if (asset.currency === "USD") {
    symbols.add(baseSymbol.replaceAll("-", "."));
  }

  symbols.add(baseSymbol.replaceAll(".", "-"));

  return Array.from(symbols);
}

async function fetchYahooAssetData(asset: AssetRow, start: Date, end: Date) {
  for (const yahooSymbol of getTickerCandidates(asset)) {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`);
    url.searchParams.set("period1", String(toUnixSeconds(start)));
    url.searchParams.set("period2", String(toUnixSeconds(end)));
    url.searchParams.set("interval", "1d");
    url.searchParams.set("events", "div|split");

    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "PF Planner local MVP",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        chart?: {
          result?: Array<{
            timestamp?: number[];
            meta?: { currency?: string };
            indicators?: {
              quote?: Array<{
                open?: Array<number | null>;
                high?: Array<number | null>;
                low?: Array<number | null>;
                close?: Array<number | null>;
                volume?: Array<number | null>;
              }>;
              adjclose?: Array<{ adjclose?: Array<number | null> }>;
            };
            events?: {
              dividends?: Record<string, { date: number; amount: number }>;
              splits?: Record<string, { date: number; numerator: number; denominator: number; splitRatio?: string }>;
            };
          }>;
          error?: unknown;
        };
      };

      const result = payload.chart?.result?.[0];
      const timestamps = result?.timestamp ?? [];
      const quote = result?.indicators?.quote?.[0];
      const adjusted = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
      const resultCurrency = normalizeCurrency(result?.meta?.currency) ?? asset.currency;

      if (!result || timestamps.length === 0 || !quote) {
        continue;
      }

      if (resultCurrency !== asset.currency) {
        continue;
      }

      const prices: DailyPriceInput[] = timestamps.flatMap((timestamp, index) => {
        const close = numberOrNull(quote.close?.[index]);

        if (close === null) {
          return [];
        }

        return [
          {
            assetId: asset.id,
            date: formatDate(new Date(timestamp * 1000)),
            open: numberOrNull(quote.open?.[index]),
            high: numberOrNull(quote.high?.[index]),
            low: numberOrNull(quote.low?.[index]),
            close,
            adjustedClose: numberOrNull(adjusted[index]),
            volume: numberOrNull(quote.volume?.[index]),
            currency: asset.currency,
            source: YAHOO_SOURCE,
          },
        ];
      });

      const corporateActions: CorporateActionInput[] = [
        ...Object.values(result.events?.dividends ?? {}).map((event) => ({
          assetId: asset.id,
          type: "DIVIDEND" as const,
          exDate: formatDate(new Date(event.date * 1000)),
          payDate: null,
          amount: event.amount,
          ratio: null,
          currency: asset.currency,
          source: YAHOO_SOURCE,
          metadata: { yahooSymbol },
        })),
        ...Object.values(result.events?.splits ?? {}).map((event) => ({
          assetId: asset.id,
          type: "SPLIT" as const,
          exDate: formatDate(new Date(event.date * 1000)),
          payDate: null,
          amount: null,
          ratio: event.denominator > 0 ? event.numerator / event.denominator : null,
          currency: null,
          source: YAHOO_SOURCE,
          metadata: { yahooSymbol, splitRatio: event.splitRatio },
        })),
      ].filter((action) => action.type === "DIVIDEND" || (action.ratio !== null && action.ratio > 0));

      if (prices.length > 0) {
        return { prices, corporateActions, providerSymbol: yahooSymbol };
      }
    } catch {
      continue;
    }
  }

  return null;
}

function parseCsv(text: string) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift()?.split(",").map((header) => header.trim()) ?? [];

  return lines
    .filter(Boolean)
    .map((line) => {
      const values = line.split(",");
      return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
    });
}

async function fetchStooqPrices(asset: AssetRow, start: Date, end: Date) {
  const candidates = getTickerCandidates(asset).flatMap((symbol) => {
    const lower = symbol.toLowerCase();
    return asset.currency === "USD" ? [lower, `${lower}.us`] : [lower];
  });

  for (const symbol of Array.from(new Set(candidates))) {
    const url = new URL("https://stooq.com/q/d/l/");
    url.searchParams.set("s", symbol);
    url.searchParams.set("d1", compactDate(start));
    url.searchParams.set("d2", compactDate(end));
    url.searchParams.set("i", "d");

    try {
      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) {
        continue;
      }

      const rows = parseCsv(await response.text());
      const prices = rows.flatMap((row): DailyPriceInput[] => {
        const close = Number(row.Close);

        if (!row.Date || !Number.isFinite(close)) {
          return [];
        }

        return [
          {
            assetId: asset.id,
            date: row.Date,
            open: Number.isFinite(Number(row.Open)) ? Number(row.Open) : null,
            high: Number.isFinite(Number(row.High)) ? Number(row.High) : null,
            low: Number.isFinite(Number(row.Low)) ? Number(row.Low) : null,
            close,
            adjustedClose: null,
            volume: Number.isFinite(Number(row.Volume)) ? Number(row.Volume) : null,
            currency: asset.currency,
            source: STOOQ_SOURCE,
          },
        ];
      });

      if (prices.length > 0) {
        return { prices, providerSymbol: symbol };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function upsertDailyPrices(pool: Pool, prices: DailyPriceInput[]) {
  let count = 0;

  for (const chunk of chunks(prices, INSERT_CHUNK_SIZE)) {
    const values = chunk.flatMap((price) => [
      price.assetId,
      price.date,
      price.open,
      price.high,
      price.low,
      price.close,
      price.adjustedClose,
      price.volume,
      price.currency,
      price.source,
    ]);
    const placeholders = chunk
      .map((_, index) => {
        const start = index * 10;
        return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6}, $${start + 7}, $${start + 8}, $${start + 9}, $${start + 10})`;
      })
      .join(",");

    await pool.query(
      `
      insert into public.daily_prices (
        asset_id, price_date, open, high, low, close, adjusted_close, volume, currency, source
      )
      values ${placeholders}
      on conflict (asset_id, price_date)
      do update set
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        adjusted_close = excluded.adjusted_close,
        volume = excluded.volume,
        currency = excluded.currency,
        source = excluded.source,
        updated_at = now()
      `,
      values,
    );
    count += chunk.length;
  }

  return count;
}

async function deleteCurrencyMismatchedMarketData(pool: Pool, asset: AssetRow, start: Date, end: Date) {
  const startDate = formatDate(start);
  const endDate = formatDate(end);
  const [dailyPricesResult, dividendActionsResult] = await Promise.all([
    pool.query(
      `
      delete from public.daily_prices
      where asset_id = $1::uuid
        and price_date between $2::date and $3::date
        and currency <> $4::char(3)
      `,
      [asset.id, startDate, endDate, asset.currency],
    ),
    pool.query(
      `
      delete from public.corporate_actions
      where asset_id = $1::uuid
        and type = 'DIVIDEND'
        and ex_date between $2::date and $3::date
        and currency is not null
        and currency <> $4::char(3)
      `,
      [asset.id, startDate, endDate, asset.currency],
    ),
  ]);

  return {
    dailyPrices: dailyPricesResult.rowCount ?? 0,
    corporateActions: dividendActionsResult.rowCount ?? 0,
  };
}

async function upsertCorporateActions(pool: Pool, actions: CorporateActionInput[]) {
  let count = 0;

  for (const chunk of chunks(actions, INSERT_CHUNK_SIZE)) {
    const values = chunk.flatMap((action) => [
      action.assetId,
      action.type,
      action.exDate,
      action.payDate,
      action.amount,
      action.ratio,
      action.currency,
      action.source,
      JSON.stringify(action.metadata),
    ]);
    const placeholders = chunk
      .map((_, index) => {
        const start = index * 9;
        return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6}, $${start + 7}, $${start + 8}, $${start + 9}::jsonb)`;
      })
      .join(",");

    await pool.query(
      `
      insert into public.corporate_actions (
        asset_id, type, ex_date, pay_date, amount, ratio, currency, source, metadata
      )
      values ${placeholders}
      on conflict do nothing
      `,
      values,
    );
    count += chunk.length;
  }

  return count;
}

async function fetchEcbFxRates(currencies: string[], startDate: string, endDate: string) {
  const requested = Array.from(new Set(currencies.filter((currency) => currency !== "EUR"))).sort();

  if (requested.length === 0) {
    return [];
  }

  const url = new URL(`https://data-api.ecb.europa.eu/service/data/EXR/D.${requested.join("+")}.EUR.SP00.A`);
  url.searchParams.set("startPeriod", startDate);
  url.searchParams.set("endPeriod", endDate);
  url.searchParams.set("format", "csvdata");

  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`ECB FX request failed with ${response.status}`);
  }

  const rows = parseCsv(await response.text());
  return rows.flatMap((row) => {
    const currency = row.CURRENCY;
    const date = row.TIME_PERIOD;
    const rate = Number(row.OBS_VALUE);

    if (!currency || !date || !Number.isFinite(rate) || rate <= 0) {
      return [];
    }

    return [{ currency, date, rate }];
  });
}

async function upsertFxRates(pool: Pool, assetCurrencies: string[], baseCurrency: string, startDate: string, endDate: string) {
  const currencies = Array.from(new Set([...assetCurrencies, baseCurrency, "EUR"])).sort();
  const sourceCurrencies = Array.from(
    new Set(assetCurrencies.filter((currency) => currency !== baseCurrency)),
  ).sort();
  const ecbRates = await fetchEcbFxRates(currencies, startDate, endDate);
  const byDate = new Map<string, Map<string, number>>();
  const rows: Array<{
    date: string;
    fromCurrency: string;
    toCurrency: string;
    rate: number;
  }> = [];

  for (const rate of ecbRates) {
    const dayRates = byDate.get(rate.date) ?? new Map<string, number>();
    dayRates.set(rate.currency, rate.rate);
    byDate.set(rate.date, dayRates);
  }

  let count = 0;
  for (const [date, rates] of byDate.entries()) {
    rates.set("EUR", 1);

    for (const fromCurrency of sourceCurrencies) {
      const fromPerEur = rates.get(fromCurrency);
      const basePerEur = rates.get(baseCurrency);

      if (!fromPerEur || !basePerEur) {
        continue;
      }

      rows.push({
        date,
        fromCurrency,
        toCurrency: baseCurrency,
        rate: basePerEur / fromPerEur,
      });
    }
  }

  for (const chunk of chunks(rows, INSERT_CHUNK_SIZE)) {
    const values = chunk.flatMap((row) => [row.date, row.fromCurrency, row.toCurrency, row.rate, ECB_SOURCE]);
    const placeholders = chunk
      .map((_, index) => {
        const start = index * 5;
        return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5})`;
      })
      .join(",");

    await pool.query(
      `
      insert into public.fx_rates (rate_date, from_currency, to_currency, rate, source)
      values ${placeholders}
      on conflict (rate_date, from_currency, to_currency, source)
      do update set rate = excluded.rate, updated_at = now()
      `,
      values,
    );
    count += chunk.length;
  }

  return count;
}

async function getIncrementalFxStartDate(pool: Pool, assetCurrencies: string[], baseCurrency: string, fallbackStart: Date) {
  const sourceCurrencies = Array.from(new Set(assetCurrencies.filter((currency) => currency !== baseCurrency)));

  if (sourceCurrencies.length === 0) {
    return fallbackStart;
  }

  const result = await pool.query<{ latest_rate_date: string | null }>(
    `
    select min(latest_rate_date)::text as latest_rate_date
    from (
      select from_currency, max(rate_date) as latest_rate_date
      from public.fx_rates
      where source = $1
        and to_currency = $2
        and from_currency = any($3::char(3)[])
      group by from_currency
    ) latest_by_currency
    `,
    [ECB_SOURCE, baseCurrency, sourceCurrencies],
  );

  return getIncrementalStartDate(result.rows[0]?.latest_rate_date ?? null, fallbackStart);
}

export async function recalculatePortfolioData(
  onProgress?: RecalculateProgressHandler,
  mode: RecalculateMode = "full",
): Promise<RecalculateSummary> {
  const pool = createPostgresPool();

  if (!pool) {
    throw new Error("Missing PFP_SUPABASE_DATABASE_URL or DATABASE_URL.");
  }

  const userId = process.env.PFP_SUPABASE_USER_ID ?? null;
  const portfolioName = process.env.PFP_PORTFOLIO_NAME ?? null;
  const { start, end, endDate } = getDateRange();
  const warnings: string[] = [];

  const assetsResult = await pool.query<PortfolioAssetRow>(
    `
    select distinct
      p.id as portfolio_id,
      p.name as portfolio_name,
      p.base_currency,
      a.id,
      a.symbol,
      a.exchange,
      a.name,
      a.currency,
      a.asset_type,
      a.data_provider,
      a.provider_symbol,
      min(t.trade_date)::text as first_trade_date,
      max(dp.price_date)::text as latest_price_date
    from public.portfolios p
    join public.transactions t on t.portfolio_id = p.id
    join public.assets a on a.id = t.asset_id
    left join public.daily_prices dp on dp.asset_id = a.id
    where p.is_archived = false
      and ($1::uuid is null or p.user_id = $1::uuid)
      and ($2::text is null or p.name = $2::text)
    group by
      p.id,
      p.name,
      p.base_currency,
      a.id,
      a.symbol,
      a.exchange,
      a.name,
      a.currency,
      a.asset_type,
      a.data_provider,
      a.provider_symbol
    order by a.symbol
    `,
    [userId, portfolioName],
  );

  const portfolioNameResult = assetsResult.rows[0]?.portfolio_name ?? portfolioName ?? "Portfolio";
  const assetCurrencies = new Set<string>();
  let baseCurrency = "CZK";
  let assetsUpdated = 0;
  let dailyPricesUpserted = 0;
  let corporateActionsUpserted = 0;

  await onProgress?.({
    type: "start",
    portfolioName: portfolioNameResult,
    totalAssets: assetsResult.rows.length,
  });

  for (const [index, asset] of assetsResult.rows.entries()) {
    const assetNumber = index + 1;

    await onProgress?.({
      type: "asset-start",
      symbol: asset.symbol,
      index: assetNumber,
      totalAssets: assetsResult.rows.length,
    });

    assetCurrencies.add(asset.currency);
    baseCurrency = asset.base_currency;

    const assetFirstTradeDate = parseTradeDate(asset.first_trade_date);
    const cleanupStart = earlierDate(start, assetFirstTradeDate);
    const removedMismatchedRows = isAfterEndDate(cleanupStart, end)
      ? { dailyPrices: 0, corporateActions: 0 }
      : await deleteCurrencyMismatchedMarketData(pool, asset, cleanupStart, end);
    if (removedMismatchedRows.dailyPrices > 0 || removedMismatchedRows.corporateActions > 0) {
      warnings.push(
        `Removed ${removedMismatchedRows.dailyPrices} price rows and ${removedMismatchedRows.corporateActions} corporate action rows with mismatched currencies for ${asset.symbol}.`,
      );
    }
    const assetStart =
      mode === "incremental" && removedMismatchedRows.dailyPrices === 0
        ? getIncrementalStartDate(asset.latest_price_date, start)
        : cleanupStart;

    if (isAfterEndDate(assetStart, end)) {
      await onProgress?.({
        type: "asset-complete",
        symbol: asset.symbol,
        index: assetNumber,
        totalAssets: assetsResult.rows.length,
        providerSymbol: asset.provider_symbol,
        dailyPricesUpserted: 0,
        corporateActionsUpserted: 0,
      });
      continue;
    }

    const yahooData = await fetchYahooAssetData(asset, assetStart, end);
    const fallbackData = yahooData ? null : await fetchStooqPrices(asset, assetStart, end);

    if (!yahooData && !fallbackData) {
      const warning = `No free historical price data found for ${asset.symbol}.`;
      warnings.push(warning);
      await onProgress?.({
        type: "asset-warning",
        symbol: asset.symbol,
        index: assetNumber,
        totalAssets: assetsResult.rows.length,
        warning,
      });
      continue;
    }

    const prices = yahooData?.prices ?? fallbackData?.prices ?? [];
    const actions = yahooData?.corporateActions ?? [];
    const providerSymbol = yahooData?.providerSymbol ?? fallbackData?.providerSymbol ?? asset.provider_symbol;

    const assetPricesUpserted = await upsertDailyPrices(pool, prices);
    const assetActionsUpserted = await upsertCorporateActions(pool, actions);
    dailyPricesUpserted += assetPricesUpserted;
    corporateActionsUpserted += assetActionsUpserted;
    assetsUpdated += 1;

    if (providerSymbol && providerSymbol !== asset.provider_symbol) {
      await pool.query(
        "update public.assets set provider_symbol = $1, data_provider = $2, updated_at = now() where id = $3",
        [providerSymbol, yahooData ? YAHOO_SOURCE : STOOQ_SOURCE, asset.id],
      );
    }

    await onProgress?.({
      type: "asset-complete",
      symbol: asset.symbol,
      index: assetNumber,
      totalAssets: assetsResult.rows.length,
      providerSymbol,
      dailyPricesUpserted: assetPricesUpserted,
      corporateActionsUpserted: assetActionsUpserted,
    });
  }

  let fxRatesUpserted = 0;
  try {
    const currencyList = Array.from(assetCurrencies).sort();
    const earliestTradeDate = assetsResult.rows.reduce(
      (earliest, asset) => earlierDate(earliest, parseTradeDate(asset.first_trade_date)),
      start,
    );
    const fxStart =
      mode === "incremental"
        ? await getIncrementalFxStartDate(pool, currencyList, baseCurrency, start)
        : earlierDate(start, earliestTradeDate);
    await onProgress?.({ type: "fx-start", currencies: currencyList });
    fxRatesUpserted = isAfterEndDate(fxStart, end)
      ? 0
      : await upsertFxRates(pool, currencyList, baseCurrency, formatDate(fxStart), endDate);
    await onProgress?.({ type: "fx-complete", fxRatesUpserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ECB FX error";
    warnings.push(message);
  }

  const summary = {
    portfolioName: portfolioNameResult,
    assetsScanned: assetsResult.rowCount ?? assetsResult.rows.length,
    assetsUpdated,
    dailyPricesUpserted,
    corporateActionsUpserted,
    fxRatesUpserted,
    warnings,
  };

  await onProgress?.({ type: "complete", summary });

  return summary;
}
