import {
  allocation as demoAllocation,
  holdings as demoHoldings,
  metrics as demoMetrics,
  portfolioSeries as demoPortfolioSeries,
  transactions as demoTransactions,
  type Holding,
} from "@/lib/demo-data";
import { canUseDemoFallback } from "@/lib/auth/config";
import type { CurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";
import { defaultNumberFormatPreferences, formatCurrencyAmount, formatNumber, formatPercent } from "@/lib/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type DbPortfolio = {
  id: string;
  name: string;
  base_currency: string;
  cost_basis_method: string;
};

type DbAsset = {
  id: string;
  symbol: string;
  isin?: string | null;
  broker: string;
  name: string | null;
  currency: string;
  asset_type: Holding["type"] | "CASH";
  provider_symbol: string | null;
};

type DbTransaction = {
  id: string;
  portfolio_id: string;
  asset_id: string | null;
  cash_account_id: string | null;
  type:
    | "BUY"
    | "SELL"
    | "DIVIDEND"
    | "FEE"
    | "TAX"
    | "CASH_DEPOSIT"
    | "CASH_WITHDRAWAL"
    | "CASH_ADJUSTMENT";
  trade_date: string;
  quantity: string | number | null;
  price: string | number | null;
  gross_amount: string | number | null;
  fee: string | number;
  tax: string | number;
  currency: string;
  source: string;
  metadata: {
    source_row?: {
      value?: string;
    };
  } | null;
  assets: DbAsset | null;
};

type DbDailyPrice = {
  asset_id: string;
  price_date: string;
  close: string | number;
  adjusted_close: string | number | null;
  currency: string;
};

type DbFxRate = {
  rate_date: string;
  from_currency: string;
  to_currency: string;
  rate: string | number;
};

type DbCorporateAction = {
  asset_id: string;
  type: "DIVIDEND" | "SPLIT";
  ex_date: string;
  amount: string | number | null;
  currency: string | null;
  source: string;
  metadata: {
    yahooSymbol?: string;
  } | null;
};

type DbPortfolioCashAccount = {
  id: string;
  portfolio_id: string;
  broker: string;
  currency: string;
  name: string | null;
};

type PeriodKey = "D" | "W" | "M" | "Y";

type PeriodPerformance = {
  label: PeriodKey;
  value: number;
};

export type PortfolioSeriesPoint = {
  date: string;
  label: string;
  value: number;
};

type DashboardHolding = Holding & {
  assetId: string;
  periodChange: Record<PeriodKey, number>;
  buyTransactions: BuyTransactionHistoryRow[];
  dividendHistory: DividendHistoryRow[];
  chartEvents: AssetChartEvent[];
  costPortfolio: number;
  dividendsPortfolio: number;
  profitLossPortfolio: number;
};

export type BuyTransactionHistoryRow = {
  id: string;
  date: string;
  transactionCurrency: string;
  actualCurrency: string;
  portfolioCurrency: string;
  quantity: number;
  buyingPrice: number;
  buyingPricePortfolio: number | null;
  actualPrice: number | null;
  actualPricePortfolio: number | null;
  changePercent: number | null;
  changePortfolioPercent: number | null;
  actualValuePortfolio: number | null;
};

export type DividendHistoryRow = {
  id: string;
  date: string;
  source: "transaction" | "corporate_action";
  currency: string;
  portfolioCurrency: string;
  quantity: number | null;
  amountPerShare: number | null;
  grossAmount: number;
  netAmount: number;
  grossAmountPortfolio: number | null;
  returnImpactPercent: number | null;
};

export type AssetChartEvent = {
  id: string;
  type: "BUY" | "SELL" | "DIVIDEND";
  date: string;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  currency: string;
};

type DashboardTransaction = {
  id: string;
  type: string;
  symbol: string;
  broker: string;
  date: string;
  quantity: number | null;
  price: number | null;
  fee: number;
  volume: number;
  amount: number;
  currency: string;
};

type DbTransactionJoinRow = Omit<DbTransaction, "assets"> & {
  asset_symbol: string | null;
  asset_broker: string | null;
  asset_name: string | null;
  asset_currency: string | null;
  asset_type: DbAsset["asset_type"] | null;
  asset_provider_symbol: string | null;
};

export type DashboardData = {
  source: "supabase" | "demo";
  sourceMessage: string;
  portfolioName: string;
  baseCurrency: string;
  costBasisMethod: string;
  metrics: typeof demoMetrics;
  netWorthPerformance: PeriodPerformance[];
  portfolioSeries: PortfolioSeriesPoint[];
  allocation: typeof demoAllocation;
  holdings: DashboardHolding[];
  transactions: DashboardTransaction[];
};

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function parseImportedCzkValue(value: string | undefined) {
  if (!value || !value.includes("Kč")) {
    return 0;
  }

  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/Kč/g, "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function subtractDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() - days);
  return nextDate;
}

function subtractYears(date: Date, years: number) {
  const nextDate = new Date(date);
  nextDate.setUTCFullYear(nextDate.getUTCFullYear() - years);
  return nextDate;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function currentYearStartKey() {
  return `${new Date().getUTCFullYear()}-01-01`;
}

function formatSeriesLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function priceValue(price: DbDailyPrice | undefined) {
  return toNumber(price?.adjusted_close ?? price?.close);
}

function fxKey(fromCurrency: string, toCurrency: string) {
  return `${fromCurrency}->${toCurrency}`;
}

function findPriceAtOrBefore(prices: DbDailyPrice[], targetDate: Date) {
  const targetKey = dateKey(targetDate);
  return prices.find((price) => price.price_date <= targetKey);
}

function calculatePeriodChange(prices: DbDailyPrice[], days: number) {
  const latest = prices[0];
  const latestValue = priceValue(latest);

  if (!latest || latestValue <= 0) {
    return 0;
  }

  const prior = findPriceAtOrBefore(prices, subtractDays(new Date(`${latest.price_date}T00:00:00Z`), days));
  const priorValue = priceValue(prior);

  if (priorValue <= 0) {
    return 0;
  }

  return ((latestValue - priorValue) / priorValue) * 100;
}

function findFxRateAtOrBefore(rates: DbFxRate[], targetDate: string) {
  return rates.find((rate) => rate.rate_date <= targetDate);
}

function conversionRate(
  fxHistory: Map<string, DbFxRate[]>,
  fromCurrency: string,
  toCurrency: string,
  targetDate: string,
) {
  if (fromCurrency === toCurrency) {
    return 1;
  }

  const direct = findFxRateAtOrBefore(fxHistory.get(fxKey(fromCurrency, toCurrency)) ?? [], targetDate);

  if (direct) {
    return toNumber(direct.rate);
  }

  const inverse = findFxRateAtOrBefore(fxHistory.get(fxKey(toCurrency, fromCurrency)) ?? [], targetDate);
  const inverseRate = toNumber(inverse?.rate);

  return inverseRate > 0 ? 1 / inverseRate : null;
}

function conversionRateWithPivot(
  fxHistory: Map<string, DbFxRate[]>,
  fromCurrency: string,
  toCurrency: string,
  targetDate: string,
  pivotCurrency: string,
) {
  const directRate = conversionRate(fxHistory, fromCurrency, toCurrency, targetDate);

  if (directRate !== null) {
    return directRate;
  }

  const fromToPivot = conversionRate(fxHistory, fromCurrency, pivotCurrency, targetDate);
  const targetToPivot = conversionRate(fxHistory, toCurrency, pivotCurrency, targetDate);

  if (fromToPivot === null || targetToPivot === null || targetToPivot <= 0) {
    return null;
  }

  return fromToPivot / targetToPivot;
}

function demoData(sourceMessage: string): DashboardData {
  return {
    source: "demo",
    sourceMessage,
    portfolioName: "Long-term wealth",
    baseCurrency: "CZK",
    costBasisMethod: "FIFO",
    metrics: demoMetrics,
    netWorthPerformance: [
      { label: "D", value: 1.28 },
      { label: "W", value: -3.45 },
      { label: "M", value: 25.12 },
      { label: "Y", value: 48.45 },
    ],
    portfolioSeries: demoPortfolioSeries.map((point, index) => {
      const date = new Date(Date.UTC(new Date().getUTCFullYear(), index, 1));

      return {
        date: dateKey(date),
        label: point.month,
        value: point.value,
      };
    }),
    allocation: demoAllocation,
    holdings: demoHoldings.map((holding) => ({
      ...holding,
      assetId: `demo-${holding.symbol}`,
      costPortfolio: holding.valueCzk * 0.82,
      dividendsPortfolio: 0,
      profitLossPortfolio: holding.valueCzk - holding.valueCzk * 0.82,
      periodChange: {
        D: holding.dayChange,
        W: -3.45,
        M: 25.12,
        Y: 48.45,
      },
      buyTransactions: [
        {
          id: `${holding.symbol}-demo-buy`,
          date: "2026-01-15",
          transactionCurrency: holding.currency,
          actualCurrency: holding.currency,
          portfolioCurrency: "CZK",
          quantity: 1,
          buyingPrice: holding.valueCzk * 0.82,
          buyingPricePortfolio: holding.valueCzk * 0.82,
          actualPrice: holding.valueCzk,
          actualPricePortfolio: holding.valueCzk,
          changePercent: holding.totalReturn,
          changePortfolioPercent: holding.totalReturn,
          actualValuePortfolio: holding.valueCzk,
        },
      ],
      dividendHistory: [
        {
          id: `${holding.symbol}-demo-dividend`,
          date: "2026-05-03",
          source: "corporate_action",
          currency: holding.currency,
          portfolioCurrency: "CZK",
          quantity: 1,
          amountPerShare: 2.4,
          grossAmount: 2.4,
          netAmount: 2.4,
          grossAmountPortfolio: 60,
          returnImpactPercent: 0.01,
        },
      ],
      chartEvents: [
        {
          id: `${holding.symbol}-demo-buy-event`,
          type: "BUY",
          date: "2026-01-15",
          quantity: 1,
          price: holding.latestPrice,
          amount: null,
          currency: holding.currency,
        },
      ],
    })),
    transactions: demoTransactions.map((transaction, index) => ({
      id: `demo-transaction-${index}`,
      type: transaction.type,
      symbol: transaction.symbol,
      broker: "Demo",
      date: transaction.date,
      quantity: null,
      price: null,
      fee: 0,
      volume: Math.abs(transaction.amount),
      amount: transaction.amount,
      currency: transaction.currency,
    })),
  };
}

function transactionCashValue(transaction: DbTransaction) {
  const grossAmount = toNumber(transaction.gross_amount);
  if (grossAmount > 0) {
    return grossAmount;
  }

  return toNumber(transaction.quantity) * toNumber(transaction.price);
}

function transactionPortfolioValue(
  transaction: DbTransaction,
  fxHistory: Map<string, DbFxRate[]>,
  portfolioCurrency: string,
  value: number,
) {
  const rate = conversionRate(fxHistory, transaction.currency, portfolioCurrency, transaction.trade_date);

  return rate === null ? 0 : value * rate;
}

function cashAccountDelta(transaction: DbTransaction) {
  const gross = transactionCashValue(transaction);
  const feeAndTax = toNumber(transaction.fee) + toNumber(transaction.tax);

  if (transaction.type === "CASH_DEPOSIT" || transaction.type === "SELL" || transaction.type === "DIVIDEND") {
    return gross - feeAndTax;
  }

  if (transaction.type === "CASH_WITHDRAWAL" || transaction.type === "BUY" || transaction.type === "FEE" || transaction.type === "TAX") {
    return -(gross + feeAndTax);
  }

  if (transaction.type === "CASH_ADJUSTMENT") {
    return gross;
  }

  return 0;
}

function quantityHeldOnDate(transactions: DbTransaction[], assetId: string, targetDate: string) {
  return transactions.reduce((quantity, transaction) => {
    if (transaction.asset_id !== assetId || transaction.trade_date > targetDate) {
      return quantity;
    }

    if (transaction.type === "BUY") {
      return quantity + toNumber(transaction.quantity);
    }

    if (transaction.type === "SELL") {
      return quantity - toNumber(transaction.quantity);
    }

    return quantity;
  }, 0);
}

function uniqueDividendActions(corporateActions: DbCorporateAction[]) {
  const byAssetDate = new Map<string, DbCorporateAction>();

  for (const action of corporateActions) {
    if (action.type !== "DIVIDEND" || !action.currency || toNumber(action.amount) <= 0) {
      continue;
    }

    const key = `${action.asset_id}|${action.ex_date}|${action.currency}`;
    const existing = byAssetDate.get(key);

    if (!existing || toNumber(action.amount) > toNumber(existing.amount)) {
      byAssetDate.set(key, action);
    }
  }

  return Array.from(byAssetDate.values());
}

function buildTransactionDividendsYtd(
  transactions: DbTransaction[],
  fxHistory: Map<string, DbFxRate[]>,
  portfolioCurrency: string,
) {
  const startDate = currentYearStartKey();
  const endDate = dateKey(new Date());
  const dividendTransactions = transactions.filter(
    (transaction) =>
      transaction.type === "DIVIDEND" &&
      transaction.trade_date >= startDate &&
      transaction.trade_date <= endDate,
  );

  const value = dividendTransactions.reduce((sum, transaction) => {
    const netDividend = transactionCashValue(transaction) - toNumber(transaction.fee) - toNumber(transaction.tax);
    return sum + transactionPortfolioValue(transaction, fxHistory, portfolioCurrency, netDividend);
  }, 0);

  return {
    count: dividendTransactions.length,
    value,
  };
}

function buildCorporateActionDividendsYtd(
  transactions: DbTransaction[],
  corporateActions: DbCorporateAction[],
  fxHistory: Map<string, DbFxRate[]>,
  portfolioCurrency: string,
) {
  const startDate = currentYearStartKey();
  const endDate = dateKey(new Date());
  const providerSymbolByAsset = new Map<string, string | null>();

  for (const transaction of transactions) {
    if (transaction.asset_id && transaction.assets) {
      providerSymbolByAsset.set(transaction.asset_id, transaction.assets.provider_symbol);
    }
  }

  const dividendActions = uniqueDividendActions(corporateActions).filter(
    (action) => {
      const providerSymbol = providerSymbolByAsset.get(action.asset_id);
      const actionProviderSymbol = action.metadata?.yahooSymbol;

      return (
        action.ex_date >= startDate &&
        action.ex_date <= endDate &&
        (!providerSymbol || !actionProviderSymbol || actionProviderSymbol === providerSymbol)
      );
    },
  );

  const value = dividendActions.reduce((sum, action) => {
    if (!action.currency) {
      return sum;
    }

    const quantity = quantityHeldOnDate(transactions, action.asset_id, action.ex_date);
    const amount = toNumber(action.amount);
    const rate = conversionRate(fxHistory, action.currency, portfolioCurrency, action.ex_date);

    return quantity > 0 && amount > 0 && rate !== null ? sum + quantity * amount * rate : sum;
  }, 0);

  return {
    count: dividendActions.length,
    value,
  };
}

function buildPortfolioSeries(
  transactions: DbTransaction[],
  priceHistory: Map<string, DbDailyPrice[]>,
  fxHistory: Map<string, DbFxRate[]>,
  portfolioCurrency: string,
): PortfolioSeriesPoint[] {
  const pricedDates = Array.from(priceHistory.values())
    .flat()
    .map((price) => price.price_date);
  const latestPriceDate = pricedDates.sort().at(-1);
  const endDate = latestPriceDate ? new Date(`${latestPriceDate}T00:00:00Z`) : new Date();
  const earliestTransactionDate = [...transactions]
    .map((transaction) => transaction.trade_date)
    .sort()[0];
  const tenYearsAgo = subtractYears(endDate, 10);
  const startDate =
    earliestTransactionDate && earliestTransactionDate > dateKey(tenYearsAgo)
      ? new Date(`${earliestTransactionDate}T00:00:00Z`)
      : tenYearsAgo;
  const sortedTransactions = [...transactions]
    .sort((left, right) => left.trade_date.localeCompare(right.trade_date));
  const ascendingPrices = new Map(
    Array.from(priceHistory.entries()).map(([assetId, prices]) => [
      assetId,
      [...prices].sort((left, right) => left.price_date.localeCompare(right.price_date)),
    ]),
  );
  const quantities = new Map<string, number>();
  const cashBalances = new Map<string, { currency: string; balance: number }>();
  const priceIndexes = new Map<string, number>();
  const currentPrices = new Map<string, DbDailyPrice>();
  const series: PortfolioSeriesPoint[] = [];
  let transactionIndex = 0;

  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    const key = dateKey(date);

    while (
      transactionIndex < sortedTransactions.length &&
      sortedTransactions[transactionIndex].trade_date <= key
    ) {
      const transaction = sortedTransactions[transactionIndex];
      const assetId = transaction.asset_id;

      if (assetId && (transaction.type === "BUY" || transaction.type === "SELL")) {
        const signedQuantity =
          transaction.type === "BUY" ? toNumber(transaction.quantity) : -toNumber(transaction.quantity);
        quantities.set(assetId, (quantities.get(assetId) ?? 0) + signedQuantity);
      }

      if (transaction.cash_account_id) {
        const existing = cashBalances.get(transaction.cash_account_id) ?? {
          currency: transaction.currency,
          balance: 0,
        };
        existing.balance += cashAccountDelta(transaction);
        existing.currency = transaction.currency;
        cashBalances.set(transaction.cash_account_id, existing);
      }

      transactionIndex += 1;
    }

    for (const [assetId, prices] of ascendingPrices.entries()) {
      let priceIndex = priceIndexes.get(assetId) ?? -1;

      while (priceIndex + 1 < prices.length && prices[priceIndex + 1].price_date <= key) {
        priceIndex += 1;
        currentPrices.set(assetId, prices[priceIndex]);
      }

      priceIndexes.set(assetId, priceIndex);
    }

    const assetValue = Array.from(quantities.entries()).reduce((sum, [assetId, quantity]) => {
      if (quantity <= 0) {
        return sum;
      }

      const price = currentPrices.get(assetId);
      const markPrice = priceValue(price);
      const rate = price ? conversionRate(fxHistory, price.currency, portfolioCurrency, key) : null;

      return markPrice > 0 && rate !== null ? sum + quantity * markPrice * rate : sum;
    }, 0);
    const cashValue = Array.from(cashBalances.values()).reduce((sum, account) => {
      if (Math.abs(account.balance) <= 0.000001) {
        return sum;
      }

      const rate = conversionRate(fxHistory, account.currency, portfolioCurrency, key);

      return rate === null ? sum : sum + account.balance * rate;
    }, 0);

    series.push({
      date: key,
      label: formatSeriesLabel(date),
      value: assetValue + cashValue,
    });
  }

  return series.filter((point) => point.value > 0);
}

function buildTransactions(transactions: DbTransaction[]) {
  return [...transactions].sort((left, right) => {
    const dateOrder = right.trade_date.localeCompare(left.trade_date);

    if (dateOrder !== 0) {
      return dateOrder;
    }

    return right.id.localeCompare(left.id);
  }).slice(0, 10).map((transaction) => {
    const cash = transactionCashValue(transaction) + toNumber(transaction.fee) + toNumber(transaction.tax);
    const amount =
      transaction.type === "BUY" ||
      transaction.type === "FEE" ||
      transaction.type === "TAX" ||
      transaction.type === "CASH_WITHDRAWAL"
        ? -cash
        : cash;

    return {
      id: transaction.id,
      type: transaction.type,
      symbol: transaction.assets?.symbol ?? transaction.type,
      broker: transaction.assets?.broker ?? "Cash",
      date: transaction.trade_date,
      quantity: toNumber(transaction.quantity) || null,
      price: toNumber(transaction.price) || null,
      fee: toNumber(transaction.fee),
      volume: transactionCashValue(transaction),
      amount,
      currency: transaction.currency,
    };
  });
}

function buildBuyTransactionHistory({
  assetId,
  transactions,
  prices,
  fxHistory,
  portfolioCurrency,
}: {
  assetId: string;
  transactions: DbTransaction[];
  prices: DbDailyPrice[];
  fxHistory: Map<string, DbFxRate[]>;
  portfolioCurrency: string;
}) {
  const latestPrice = prices[0];
  const latestPriceValue = priceValue(latestPrice);
  const latestPriceDate = latestPrice?.price_date ?? new Date().toISOString().slice(0, 10);
  const latestPriceCurrency =
    latestPrice?.currency ?? transactions.find((transaction) => transaction.asset_id === assetId)?.assets?.currency;
  const actualPortfolioRate =
    latestPriceCurrency && latestPriceValue > 0
      ? conversionRateWithPivot(fxHistory, latestPriceCurrency, portfolioCurrency, latestPriceDate, portfolioCurrency)
      : null;
  const actualPricePortfolio =
    actualPortfolioRate !== null && latestPriceValue > 0 ? latestPriceValue * actualPortfolioRate : null;

  return transactions
    .filter((transaction) => transaction.asset_id === assetId && transaction.type === "BUY")
    .sort((left, right) => right.trade_date.localeCompare(left.trade_date))
    .map((transaction) => {
      const quantity = toNumber(transaction.quantity);
      const buyingPrice = toNumber(transaction.price);
      const buyingRate = conversionRate(fxHistory, transaction.currency, portfolioCurrency, transaction.trade_date);
      const buyingPricePortfolio = buyingRate && buyingPrice > 0 ? buyingPrice * buyingRate : null;
      const actualTransactionRate =
        latestPriceCurrency && latestPriceValue > 0
          ? conversionRateWithPivot(
              fxHistory,
              latestPriceCurrency,
              transaction.currency,
              latestPriceDate,
              portfolioCurrency,
            )
          : null;
      const actualPriceTransaction =
        actualTransactionRate !== null && latestPriceValue > 0 ? latestPriceValue * actualTransactionRate : null;
      const changePercent =
        buyingPrice > 0 && actualPriceTransaction !== null
          ? ((actualPriceTransaction - buyingPrice) / buyingPrice) * 100
          : null;
      const changePortfolioPercent =
        buyingPricePortfolio && actualPricePortfolio
          ? ((actualPricePortfolio - buyingPricePortfolio) / buyingPricePortfolio) * 100
          : null;

      return {
        id: transaction.id,
        date: transaction.trade_date,
        transactionCurrency: transaction.currency,
        actualCurrency: transaction.currency,
        portfolioCurrency,
        quantity,
        buyingPrice,
        buyingPricePortfolio,
        actualPrice: actualPriceTransaction,
        actualPricePortfolio,
        changePercent,
        changePortfolioPercent,
        actualValuePortfolio: actualPricePortfolio ? actualPricePortfolio * quantity : null,
      } satisfies BuyTransactionHistoryRow;
    });
}

function buildDividendHistory({
  assetId,
  providerSymbol,
  transactions,
  corporateActions,
  fxHistory,
  portfolioCurrency,
  costPortfolio,
}: {
  assetId: string;
  providerSymbol: string | null;
  transactions: DbTransaction[];
  corporateActions: DbCorporateAction[];
  fxHistory: Map<string, DbFxRate[]>;
  portfolioCurrency: string;
  costPortfolio: number;
}) {
  const transactionRows: DividendHistoryRow[] = transactions
    .filter((transaction) => transaction.asset_id === assetId && transaction.type === "DIVIDEND")
    .map((transaction) => {
      const grossAmount = transactionCashValue(transaction);
      const netAmount = grossAmount - toNumber(transaction.fee) - toNumber(transaction.tax);
      const grossAmountPortfolio = transactionPortfolioValue(transaction, fxHistory, portfolioCurrency, netAmount);

      return {
        id: transaction.id,
        date: transaction.trade_date,
        source: "transaction",
        currency: transaction.currency,
        portfolioCurrency,
        quantity: toNumber(transaction.quantity) || null,
        amountPerShare: null,
        grossAmount,
        netAmount,
        grossAmountPortfolio,
        returnImpactPercent:
          costPortfolio > 0 && grossAmountPortfolio > 0 ? (grossAmountPortfolio / costPortfolio) * 100 : null,
      } satisfies DividendHistoryRow;
    });

  if (transactionRows.length > 0) {
    return transactionRows.sort((left, right) => right.date.localeCompare(left.date));
  }

  return uniqueDividendActions(corporateActions)
    .filter((action) => {
      if (action.asset_id !== assetId || !action.currency) {
        return false;
      }

      const actionProviderSymbol = action.metadata?.yahooSymbol;

      return !providerSymbol || !actionProviderSymbol || actionProviderSymbol === providerSymbol;
    })
    .flatMap((action): DividendHistoryRow[] => {
      const currency = action.currency;

      if (!currency) {
        return [];
      }

      const quantity = quantityHeldOnDate(transactions, assetId, action.ex_date);
      const amountPerShare = toNumber(action.amount);
      const rate = conversionRate(fxHistory, currency, portfolioCurrency, action.ex_date);
      const grossAmount = quantity * amountPerShare;
      const grossAmountPortfolio = rate !== null ? grossAmount * rate : null;

      if (quantity <= 0 || amountPerShare <= 0) {
        return [];
      }

      return [
        {
          id: `${assetId}-${action.ex_date}-${action.currency}-${amountPerShare}`,
          date: action.ex_date,
          source: "corporate_action",
          currency,
          portfolioCurrency,
          quantity,
          amountPerShare,
          grossAmount,
          netAmount: grossAmount,
          grossAmountPortfolio,
          returnImpactPercent:
            costPortfolio > 0 && grossAmountPortfolio !== null ? (grossAmountPortfolio / costPortfolio) * 100 : null,
        },
      ];
    })
    .sort((left, right) => right.date.localeCompare(left.date));
}

function buildAssetChartEvents({
  assetId,
  transactions,
  dividendHistory,
}: {
  assetId: string;
  transactions: DbTransaction[];
  dividendHistory: DividendHistoryRow[];
}): AssetChartEvent[] {
  const tradeEvents = transactions
    .filter(
      (transaction) =>
        transaction.asset_id === assetId && (transaction.type === "BUY" || transaction.type === "SELL"),
    )
    .map(
      (transaction): AssetChartEvent => ({
        id: transaction.id,
        type: transaction.type === "BUY" ? "BUY" : "SELL",
        date: transaction.trade_date,
        quantity: toNumber(transaction.quantity) || null,
        price: toNumber(transaction.price) || null,
        amount: transactionCashValue(transaction) || null,
        currency: transaction.currency,
      }),
    );
  const dividendEvents = dividendHistory.map(
    (dividend): AssetChartEvent => ({
      id: dividend.id,
      type: "DIVIDEND",
      date: dividend.date,
      quantity: dividend.quantity,
      price: null,
      amount: dividend.grossAmount,
      currency: dividend.currency,
    }),
  );

  return [...tradeEvents, ...dividendEvents].sort((left, right) => left.date.localeCompare(right.date));
}

function buildHoldings(
  transactions: DbTransaction[],
  priceHistory: Map<string, DbDailyPrice[]>,
  fxHistory: Map<string, DbFxRate[]>,
  portfolioCurrency: string,
  corporateActions: DbCorporateAction[] = [],
  cashAccounts: DbPortfolioCashAccount[] = [],
) {
  const firstBuyDates = new Map<string, string>();

  for (const transaction of transactions) {
    if (!transaction.asset_id || transaction.type !== "BUY") {
      continue;
    }

    const currentDate = firstBuyDates.get(transaction.asset_id);

    if (!currentDate || transaction.trade_date < currentDate) {
      firstBuyDates.set(transaction.asset_id, transaction.trade_date);
    }
  }

  const aggregates = new Map<
    string,
    {
      asset: DbAsset;
      quantity: number;
      costPortfolio: number;
      realizedProceedsPortfolio: number;
      feesAndTaxesPortfolio: number;
      dividendsPortfolio: number;
      importedValueCzk: number;
    }
  >();

  for (const transaction of transactions) {
    if (!transaction.asset_id || !transaction.assets) {
      continue;
    }

    const existing =
      aggregates.get(transaction.asset_id) ??
      {
        asset: transaction.assets,
        quantity: 0,
        costPortfolio: 0,
        realizedProceedsPortfolio: 0,
        feesAndTaxesPortfolio: 0,
        dividendsPortfolio: 0,
        importedValueCzk: 0,
      };

    const quantity = toNumber(transaction.quantity);
    const cash = transactionCashValue(transaction);
    const cashPortfolio = transactionPortfolioValue(transaction, fxHistory, portfolioCurrency, cash);
    const feesAndTaxesPortfolio = transactionPortfolioValue(
      transaction,
      fxHistory,
      portfolioCurrency,
      toNumber(transaction.fee) + toNumber(transaction.tax),
    );

    if (transaction.type === "BUY") {
      existing.quantity += quantity;
      existing.costPortfolio += cashPortfolio;
      existing.feesAndTaxesPortfolio += feesAndTaxesPortfolio;
      existing.importedValueCzk += parseImportedCzkValue(transaction.metadata?.source_row?.value);
    }

    if (transaction.type === "SELL") {
      existing.quantity -= quantity;
      existing.realizedProceedsPortfolio += cashPortfolio;
      existing.feesAndTaxesPortfolio += feesAndTaxesPortfolio;
    }

    if (
      transaction.type === "DIVIDEND" &&
      (!firstBuyDates.has(transaction.asset_id) || transaction.trade_date >= (firstBuyDates.get(transaction.asset_id) ?? ""))
    ) {
      existing.dividendsPortfolio += cashPortfolio - feesAndTaxesPortfolio;
    }

    if (transaction.type === "FEE" || transaction.type === "TAX") {
      existing.feesAndTaxesPortfolio += cashPortfolio + feesAndTaxesPortfolio;
    }

    aggregates.set(transaction.asset_id, existing);
  }

  const assetRows = Array.from(aggregates.entries())
    .map(([assetId, aggregate]) => {
      const prices = priceHistory.get(assetId) ?? [];
      const dividendHistory = buildDividendHistory({
        assetId,
        providerSymbol: aggregate.asset.provider_symbol,
        transactions,
        corporateActions,
        fxHistory,
        portfolioCurrency,
        costPortfolio: aggregate.costPortfolio,
      });
      const latestPrice = prices[0];
      const markPrice = toNumber(latestPrice?.adjusted_close ?? latestPrice?.close);
      const latestPriceRate = latestPrice
        ? conversionRateWithPivot(
            fxHistory,
            latestPrice.currency,
            aggregate.asset.currency,
            latestPrice.price_date,
            portfolioCurrency,
          )
        : null;
      const latestPriceAssetCurrency =
        markPrice > 0 && latestPriceRate !== null ? markPrice * latestPriceRate : null;
      const markPriceRate = latestPrice
        ? conversionRate(fxHistory, latestPrice.currency, portfolioCurrency, latestPrice.price_date)
        : null;
      const markValuePortfolio =
        markPrice > 0 && markPriceRate !== null ? aggregate.quantity * markPrice * markPriceRate : null;
      const value =
        markValuePortfolio ??
        (aggregate.importedValueCzk > 0
          ? aggregate.importedValueCzk
          : Math.max(0, aggregate.costPortfolio - aggregate.realizedProceedsPortfolio));
      const profitLossPortfolio =
        value +
        aggregate.realizedProceedsPortfolio +
        aggregate.dividendsPortfolio -
        aggregate.costPortfolio -
        aggregate.feesAndTaxesPortfolio;
      const totalReturn =
        aggregate.costPortfolio > 0
          ? (profitLossPortfolio / aggregate.costPortfolio) * 100
          : 0;

      return {
        assetId,
        symbol: aggregate.asset.symbol,
        name: aggregate.asset.name ?? aggregate.asset.symbol,
        type: aggregate.asset.asset_type === "CASH" ? "ETF" : aggregate.asset.asset_type,
        broker: aggregate.asset.broker,
        currency: aggregate.asset.currency as Holding["currency"],
        latestPrice: latestPriceAssetCurrency,
        valueCzk: value,
        allocation: 0,
        dayChange: 0,
        periodChange: {
          D: calculatePeriodChange(prices, 1),
          W: calculatePeriodChange(prices, 7),
          M: calculatePeriodChange(prices, 30),
          Y: calculatePeriodChange(prices, 365),
        },
        totalReturn,
        costPortfolio: aggregate.costPortfolio,
        dividendsPortfolio: aggregate.dividendsPortfolio,
        profitLossPortfolio,
        buyTransactions: buildBuyTransactionHistory({
          assetId,
          transactions,
          prices,
          fxHistory,
          portfolioCurrency,
        }),
        dividendHistory,
        chartEvents: buildAssetChartEvents({
          assetId,
          transactions,
          dividendHistory,
        }),
      } satisfies DashboardHolding;
    })
    .filter((holding) => holding.valueCzk > 0.000001);
  const cashRows = cashAccounts.flatMap((account): DashboardHolding[] => {
    const balance = transactions
      .filter((transaction) => transaction.cash_account_id === account.id)
      .reduce((sum, transaction) => sum + cashAccountDelta(transaction), 0);

    if (Math.abs(balance) <= 0.000001) {
      return [];
    }

    const rate = conversionRate(fxHistory, account.currency, portfolioCurrency, dateKey(new Date()));
    const value = rate === null ? (account.currency === portfolioCurrency ? balance : 0) : balance * rate;

    if (Math.abs(value) <= 0.000001) {
      return [];
    }

    return [
      {
        assetId: `cash-${account.id}`,
        symbol: `CASH ${account.currency}`,
        name: account.name ?? `${account.broker} cash`,
        type: "CASH",
        broker: account.broker,
        currency: account.currency as Holding["currency"],
        latestPrice: 1,
        valueCzk: value,
        allocation: 0,
        dayChange: 0,
        periodChange: { D: 0, W: 0, M: 0, Y: 0 },
        totalReturn: 0,
        costPortfolio: 0,
        dividendsPortfolio: 0,
        profitLossPortfolio: 0,
        buyTransactions: [],
        dividendHistory: [],
        chartEvents: [],
      },
    ];
  });
  const rows = [...assetRows, ...cashRows].sort((left, right) => right.valueCzk - left.valueCzk);

  const totalValue = rows.reduce((sum, holding) => sum + holding.valueCzk, 0);

  return rows.map((holding) => ({
    ...holding,
    allocation: totalValue > 0 ? (holding.valueCzk / totalValue) * 100 : 0,
    dayChange: holding.periodChange.D,
  }));
}

function buildAllocation(holdings: Holding[]) {
  const colors = {
    ETF: "#3B82F6",
    STOCK: "#22C55E",
    CRYPTO: "#F59E0B",
    CASH: "#94A3B8",
  };

  const totals = holdings.reduce<Record<string, number>>((accumulator, holding) => {
    accumulator[holding.type] = (accumulator[holding.type] ?? 0) + holding.allocation;
    return accumulator;
  }, {});

  return Object.entries(totals).map(([name, value]) => ({
    name: `${name[0]}${name.slice(1).toLowerCase()}`,
    value: Number(value.toFixed(1)),
    fill: colors[name as keyof typeof colors] ?? "#94A3B8",
  }));
}

function buildNetWorthPerformance(holdings: DashboardHolding[]): PeriodPerformance[] {
  const totalValue = holdings.reduce((sum, holding) => sum + holding.valueCzk, 0);

  return (["D", "W", "M", "Y"] satisfies PeriodKey[]).map((label) => {
    if (totalValue <= 0) {
      return { label, value: 0 };
    }

    const value = holdings.reduce(
      (sum, holding) => sum + holding.periodChange[label] * (holding.valueCzk / totalValue),
      0,
    );

    return { label, value };
  });
}

function mapTransactionJoinRow(row: DbTransactionJoinRow): DbTransaction {
  return {
    id: row.id,
    portfolio_id: row.portfolio_id,
    asset_id: row.asset_id,
    cash_account_id: row.cash_account_id,
    type: row.type,
    trade_date: row.trade_date,
    quantity: row.quantity,
    price: row.price,
    gross_amount: row.gross_amount,
    fee: row.fee,
    tax: row.tax,
    currency: row.currency,
    source: row.source,
    metadata: row.metadata,
    assets:
      row.asset_id && row.asset_symbol && row.asset_broker && row.asset_currency && row.asset_type
        ? {
            id: row.asset_id,
            symbol: row.asset_symbol,
            broker: row.asset_broker,
            name: row.asset_name,
            currency: row.asset_currency,
            asset_type: row.asset_type,
            provider_symbol: row.asset_provider_symbol,
          }
        : null,
  };
}

async function getPostgresDashboardData(user: CurrentPfpUser): Promise<DashboardData | null> {
  const pool = createPostgresPool();

  if (!pool) {
    return null;
  }

  const userId = user.dataUserId;
  const portfolioName = process.env.PFP_PORTFOLIO_NAME ?? null;

  try {
    const portfolioResult = await pool.query<DbPortfolio>(
      `
      select id, name, base_currency, cost_basis_method
      from public.portfolios
      where is_archived = false
        and user_id = $1::uuid
      order by
        case when $2::text is not null and name = $2::text then 0 else 1 end,
        created_at asc
      limit 1
      `,
      [userId, portfolioName],
    );

    const portfolio = portfolioResult.rows[0];

    if (!portfolio) {
      if (canUseDemoFallback()) {
        return demoData("Demo data: connected to hosted Supabase, but no portfolio rows were returned.");
      }

      throw new Error("No portfolio rows were returned for the authenticated PFP user.");
    }

    const transactionsResult = await pool.query<DbTransactionJoinRow>(
      `
      select
        t.id,
        t.portfolio_id,
        t.asset_id,
        t.cash_account_id,
        t.type,
        t.trade_date::text as trade_date,
        t.quantity,
        t.price,
        t.gross_amount,
        t.fee,
        t.tax,
        t.currency,
        t.source,
        t.metadata,
        a.symbol as asset_symbol,
        a.broker as asset_broker,
        a.name as asset_name,
        a.currency as asset_currency,
        a.asset_type as asset_type,
        a.provider_symbol as asset_provider_symbol
      from public.transactions t
      left join public.assets a on a.id = t.asset_id
      where t.portfolio_id = $1::uuid
      order by t.trade_date desc, t.created_at desc
      `,
      [portfolio.id],
    );

    const rows = transactionsResult.rows.map(mapTransactionJoinRow);
    const cashAccountsResult = await pool.query<DbPortfolioCashAccount>(
      `
      select
        id,
        portfolio_id,
        broker,
        currency::text as currency,
        name
      from public.portfolio_cash_accounts
      where portfolio_id = $1::uuid
        and is_active = true
      order by broker, currency
      `,
      [portfolio.id],
    );
    const cashAccounts = cashAccountsResult.rows;
    const assetIds = Array.from(new Set(rows.map((transaction) => transaction.asset_id).filter(Boolean))) as string[];
    const priceHistory = new Map<string, DbDailyPrice[]>();
    const fxHistory = new Map<string, DbFxRate[]>();
    const corporateActions: DbCorporateAction[] = [];

    if (assetIds.length > 0) {
      const pricesResult = await pool.query<DbDailyPrice>(
        `
        select
          asset_id,
          price_date::text as price_date,
          close,
          adjusted_close,
          currency
        from public.daily_prices
        where asset_id = any($1::uuid[])
          and price_date >= current_date - interval '10 years'
        order by asset_id, price_date desc
        `,
        [assetIds],
      );

      for (const price of pricesResult.rows) {
        priceHistory.set(price.asset_id, [...(priceHistory.get(price.asset_id) ?? []), price]);
      }

      const corporateActionsResult = await pool.query<DbCorporateAction>(
        `
        select
          asset_id,
          type,
          ex_date::text as ex_date,
          amount,
          currency::text as currency,
          source,
          metadata
        from public.corporate_actions
        where asset_id = any($1::uuid[])
          and type = 'DIVIDEND'
          and ex_date <= current_date
        order by asset_id, ex_date desc
        `,
        [assetIds],
      );

      corporateActions.push(...corporateActionsResult.rows);
    }

    const portfolioCurrency = portfolio.base_currency;
    const currencies = Array.from(
      new Set(
        [
          ...rows.flatMap((transaction) => [transaction.currency, transaction.assets?.currency]),
          ...corporateActions.map((action) => action.currency),
          ...cashAccounts.map((account) => account.currency),
          ...Array.from(priceHistory.values()).flatMap((prices) => prices.map((price) => price.currency)),
        ]
          .filter((currency): currency is string => Boolean(currency) && currency !== portfolioCurrency),
      ),
    );
    const earliestTradeDate = rows.reduce<string | null>((earliest, transaction) => {
      if (!earliest || transaction.trade_date < earliest) {
        return transaction.trade_date;
      }

      return earliest;
    }, null);

    if (currencies.length > 0 && earliestTradeDate) {
      const fxResult = await pool.query<DbFxRate>(
        `
        select
          rate_date::text as rate_date,
          from_currency::text as from_currency,
          to_currency::text as to_currency,
          rate
        from public.fx_rates
        where to_currency = $1::char(3)
          and from_currency = any($2::char(3)[])
          and rate_date >= $3::date - interval '7 days'
        order by from_currency, to_currency, rate_date desc
        `,
        [portfolioCurrency, currencies, earliestTradeDate],
      );

      for (const rate of fxResult.rows) {
        const key = fxKey(rate.from_currency, rate.to_currency);
        fxHistory.set(key, [...(fxHistory.get(key) ?? []), rate]);
      }
    }

    return buildDashboardFromRows({
      portfolio,
      rows,
      priceHistory,
      fxHistory,
      corporateActions,
      cashAccounts,
      sourceMessage: `Live hosted Supabase data from ${portfolio.name}. P/L uses portfolio-currency cost, current value, realized proceeds, and net dividends when FX is available.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";

    if (!canUseDemoFallback()) {
      throw new Error(`Hosted Supabase database query failed (${message}).`);
    }

    return demoData(`Demo data: hosted Supabase database query failed (${message}).`);
  }
}

function buildDashboardFromRows({
  portfolio,
  rows,
  priceHistory,
  fxHistory,
  corporateActions,
  cashAccounts,
  sourceMessage,
}: {
  portfolio: DbPortfolio;
  rows: DbTransaction[];
  priceHistory: Map<string, DbDailyPrice[]>;
  fxHistory: Map<string, DbFxRate[]>;
  corporateActions: DbCorporateAction[];
  cashAccounts: DbPortfolioCashAccount[];
  sourceMessage: string;
}): DashboardData {
  const holdings = buildHoldings(rows, priceHistory, fxHistory, portfolio.base_currency, corporateActions, cashAccounts);
  const netWorth = holdings.reduce((sum, holding) => sum + holding.valueCzk, 0);
  const totalCost = holdings.reduce((sum, holding) => sum + holding.costPortfolio, 0);
  const portfolioProfitLoss = holdings.reduce((sum, holding) => sum + holding.profitLossPortfolio, 0);
  const totalReturn = totalCost > 0 ? (portfolioProfitLoss / totalCost) * 100 : 0;
  const transactionDividendsYtd = buildTransactionDividendsYtd(rows, fxHistory, portfolio.base_currency);
  const corporateActionDividendsYtd =
    transactionDividendsYtd.count > 0
      ? { count: 0, value: 0 }
      : buildCorporateActionDividendsYtd(rows, corporateActions, fxHistory, portfolio.base_currency);
  const dividends =
    transactionDividendsYtd.count > 0 ? transactionDividendsYtd.value : corporateActionDividendsYtd.value;
  const dividendDelta =
    transactionDividendsYtd.count > 0
      ? "dividends after tax YTD"
      : corporateActionDividendsYtd.count > 0
        ? "estimated gross dividends YTD"
        : "no dividend rows YTD";

  return {
    source: "supabase",
    sourceMessage,
    portfolioName: portfolio.name,
    baseCurrency: portfolio.base_currency,
    costBasisMethod: portfolio.cost_basis_method,
    metrics: [
      {
        ...demoMetrics[0],
        value: formatCurrencyAmount(netWorth, portfolio.base_currency),
        delta: `${formatNumber(holdings.length)} holdings`,
      },
      {
        ...demoMetrics[1],
        value: formatCurrencyAmount(portfolioProfitLoss, portfolio.base_currency),
        delta: `${formatPercent(totalReturn, defaultNumberFormatPreferences, { sign: "always" })} return`,
        tone: portfolioProfitLoss >= 0 ? "positive" : "negative",
      },
      {
        ...demoMetrics[2],
        value: formatCurrencyAmount(dividends, portfolio.base_currency),
        delta: dividendDelta,
      },
    ],
    netWorthPerformance: buildNetWorthPerformance(holdings),
    portfolioSeries: buildPortfolioSeries(rows, priceHistory, fxHistory, portfolio.base_currency),
    allocation: buildAllocation(holdings),
    holdings,
    transactions: buildTransactions(rows),
  };
}

export async function getDashboardData(user: CurrentPfpUser): Promise<DashboardData> {
  const postgresData = await getPostgresDashboardData(user);

  if (postgresData) {
    return postgresData;
  }

  const supabase = createServerSupabaseClient();

  if (!supabase) {
    if (!canUseDemoFallback()) {
      throw new Error("Supabase is not configured for production data access.");
    }

    return demoData("Demo data: add Supabase env vars in apps/web/.env.local to read the real database.");
  }

  const { data: portfolios, error: portfoliosError } = await supabase
    .from("portfolios")
    .select("id,name,base_currency,cost_basis_method")
    .eq("is_archived", false)
    .eq("user_id", user.dataUserId)
    .order("created_at", { ascending: true })
    .limit(1)
    .returns<DbPortfolio[]>();

  if (portfoliosError) {
    if (!canUseDemoFallback()) {
      throw new Error(`Supabase portfolios query failed (${portfoliosError.message}).`);
    }

    return demoData(`Demo data: Supabase portfolios query failed (${portfoliosError.message}).`);
  }

  const portfolio = portfolios?.[0];

  if (!portfolio) {
    if (!canUseDemoFallback()) {
      throw new Error("No portfolio rows were returned from Supabase for the authenticated PFP user.");
    }

    return demoData("Demo data: no portfolio rows were returned from Supabase.");
  }

  const { data: transactions, error: transactionsError } = await supabase
    .from("transactions")
    .select(
      "id,portfolio_id,asset_id,cash_account_id,type,trade_date,quantity,price,gross_amount,fee,tax,currency,source,metadata,assets(id,symbol,broker,name,currency,asset_type,provider_symbol,isin)",
    )
    .eq("portfolio_id", portfolio.id)
    .order("trade_date", { ascending: false })
    .returns<DbTransaction[]>();

  if (transactionsError) {
    if (!canUseDemoFallback()) {
      throw new Error(`Supabase transactions query failed (${transactionsError.message}).`);
    }

    return demoData(`Demo data: Supabase transactions query failed (${transactionsError.message}).`);
  }

  const rows = transactions ?? [];
  const { data: cashAccounts } = await supabase
    .from("portfolio_cash_accounts")
    .select("id,portfolio_id,broker,currency,name")
    .eq("portfolio_id", portfolio.id)
    .eq("is_active", true)
    .order("broker", { ascending: true })
    .returns<DbPortfolioCashAccount[]>();
  const assetIds = Array.from(new Set(rows.map((transaction) => transaction.asset_id).filter(Boolean))) as string[];
  const priceHistory = new Map<string, DbDailyPrice[]>();
  let corporateActions: DbCorporateAction[] = [];

  if (assetIds.length > 0) {
    const { data: prices } = await supabase
      .from("daily_prices")
      .select("asset_id,price_date,close,adjusted_close,currency")
      .in("asset_id", assetIds)
      .order("price_date", { ascending: false })
      .returns<DbDailyPrice[]>();

    for (const price of prices ?? []) {
      priceHistory.set(price.asset_id, [...(priceHistory.get(price.asset_id) ?? []), price]);
    }

    const { data: actions } = await supabase
      .from("corporate_actions")
      .select("asset_id,type,ex_date,amount,currency,source,metadata")
      .in("asset_id", assetIds)
      .eq("type", "DIVIDEND")
      .lte("ex_date", dateKey(new Date()))
      .returns<DbCorporateAction[]>();

    corporateActions = actions ?? [];
  }

  return buildDashboardFromRows({
    portfolio,
    rows,
    priceHistory,
    fxHistory: new Map(),
    corporateActions,
    cashAccounts: cashAccounts ?? [],
    sourceMessage: `Live Supabase data from ${portfolio.name}. Values use latest daily prices when available; P/L conversion needs stored FX rates.`,
  });
}
