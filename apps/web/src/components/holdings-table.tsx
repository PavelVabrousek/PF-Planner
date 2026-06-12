"use client";

import { useMemo, useState } from "react";
import { HoldingActions } from "@/components/holding-actions";
import { PortfolioChart } from "@/components/portfolio-chart";
import type { PortfolioRange } from "@/components/portfolio-chart";
import { LineChart, MoreHorizontal, X } from "lucide-react";
import { defaultNumberFormatPreferences, formatCurrencyAmount, formatCurrencyNumber, formatPercent } from "@/lib/format";
import type { DashboardData } from "@/lib/portfolio-data";
import { cn } from "@/lib/utils";

type HoldingsTableProps = {
  holdings: DashboardData["holdings"];
  portfolioCurrency: string;
  costBasisMethod: string;
  brokerFilter: string;
  brokerOptions: string[];
  showHoldings: boolean;
  showCash: boolean;
  portfolioRange: PortfolioRange;
  onBrokerFilterChange: (broker: string) => void;
  onShowHoldingsChange: (show: boolean) => void;
  onShowCashChange: (show: boolean) => void;
  onPortfolioRangeChange: (range: PortfolioRange) => void;
};

type HoldingRow = DashboardData["holdings"][number];

function CashHoldingActions({
  holding,
  portfolioCurrency,
  portfolioRange,
  openMenuAssetId,
  onOpenMenuChange,
  onPortfolioRangeChange,
}: {
  holding: HoldingRow;
  portfolioCurrency: string;
  portfolioRange: PortfolioRange;
  openMenuAssetId: string | null;
  onOpenMenuChange: (assetId: string | null) => void;
  onPortfolioRangeChange: (range: PortfolioRange) => void;
}) {
  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const isMenuOpen = openMenuAssetId === holding.assetId;
  const transactions = holding.cashTransactions ?? [];

  function openChartWindow() {
    onOpenMenuChange(null);
    setIsWindowOpen(true);
  }

  return (
    <div className="relative flex shrink-0 justify-start">
      <button
        type="button"
        aria-label={`${holding.symbol} actions`}
        onClick={() => onOpenMenuChange(isMenuOpen ? null : holding.assetId)}
        className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] border border-white/10 text-slate-400 hover:border-neutral/50 hover:text-slate-50"
      >
        <MoreHorizontal size={13} />
      </button>

      {isMenuOpen ? (
        <div className="absolute left-0 top-7 z-[1000] w-44 rounded-lg border border-white/10 bg-panel p-1 shadow-panel">
          <button
            type="button"
            onClick={openChartWindow}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-slate-300 hover:bg-surface hover:text-slate-50"
          >
            <LineChart size={14} />
            Balance chart
          </button>
        </div>
      ) : null}

      {isWindowOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/55 p-2 backdrop-blur-sm sm:p-4">
          <section className="max-h-[calc(100dvh-1rem)] w-full max-w-4xl overflow-y-auto rounded-lg border border-white/10 bg-panel p-3 text-left shadow-panel sm:max-h-[calc(100dvh-2rem)] sm:p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{holding.broker}</p>
                <h2 className="truncate text-base font-semibold text-slate-50">{holding.symbol} balance</h2>
              </div>
              <button
                type="button"
                aria-label={`Close ${holding.symbol} balance chart`}
                onClick={() => setIsWindowOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-slate-50"
              >
                <X size={15} />
              </button>
            </div>

            <div className="rounded-lg border border-white/10 bg-background/40 p-3">
              <PortfolioChart
                data={holding.cashSeries ?? []}
                currency={portfolioCurrency}
                eyebrow="Cash holding"
                title={`${holding.name} · ${holding.currency}`}
                range={portfolioRange}
                onRangeChange={onPortfolioRangeChange}
                rangeControlName={`cash-${holding.assetId}-range`}
              />
            </div>

            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-50">Transactions</h3>
                <span className="text-xs text-slate-500">{transactions.length} rows</span>
              </div>
              <div className="overflow-x-auto rounded-md border border-white/10">
                <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left text-xs">
                  <thead className="bg-background/70 text-slate-500">
                    <tr>
                      <th className="border-b border-white/10 px-2 py-2 font-medium">Date</th>
                      <th className="border-b border-white/10 px-2 py-2 font-medium">Type</th>
                      <th className="border-b border-white/10 px-2 py-2 text-right font-medium">Volume</th>
                      <th className="border-b border-white/10 px-2 py-2 text-right font-medium">Fee</th>
                      <th className="border-b border-white/10 px-2 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => (
                      <tr key={transaction.id} className="text-slate-200">
                        <td className="border-b border-white/5 px-2 py-2 font-mono text-slate-500">{transaction.date}</td>
                        <td className="border-b border-white/5 px-2 py-2 font-mono text-slate-300">{transaction.type}</td>
                        <td className="border-b border-white/5 px-2 py-2 text-right font-mono tabular text-slate-300">
                          {formatCurrencyAmount(transaction.volume, transaction.currency)}
                        </td>
                        <td className="border-b border-white/5 px-2 py-2 text-right font-mono tabular text-slate-400">
                          {transaction.fee ? formatCurrencyAmount(transaction.fee, transaction.currency) : "-"}
                        </td>
                        <td
                          className={cn(
                            "border-b border-white/5 px-2 py-2 text-right font-mono tabular",
                            transaction.amount >= 0 ? "text-positive" : "text-negative",
                          )}
                        >
                          {formatCurrencyAmount(transaction.amount, transaction.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {transactions.length === 0 ? (
                  <div className="px-3 py-6 text-xs text-slate-500">No cash transactions found.</div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function HoldingsTable({
  holdings,
  portfolioCurrency,
  costBasisMethod,
  brokerFilter,
  brokerOptions,
  showHoldings,
  showCash,
  portfolioRange,
  onBrokerFilterChange,
  onShowHoldingsChange,
  onShowCashChange,
  onPortfolioRangeChange,
}: HoldingsTableProps) {
  const [openMenuAssetId, setOpenMenuAssetId] = useState<string | null>(null);
  const visibleHoldings = useMemo(
    () =>
      holdings
        .filter((holding) => (holding.type === "CASH" ? showCash : showHoldings))
        .filter((holding) => brokerFilter === "ALL" || holding.broker === brokerFilter),
    [brokerFilter, holdings, showCash, showHoldings],
  );

  return (
    <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-50">Holdings</h2>
          <div className="flex items-center gap-1 rounded-md border border-white/10 bg-background/60 p-1">
            <label className="flex h-6 cursor-pointer items-center gap-1 rounded px-2 text-[10px] font-medium text-slate-400 hover:text-slate-100">
              <input
                type="checkbox"
                checked={showHoldings}
                onChange={(event) => onShowHoldingsChange(event.target.checked)}
                className="h-3 w-3 rounded border-white/20 bg-panel text-neutral focus:ring-neutral/40"
              />
              Holdings
            </label>
            <label className="flex h-6 cursor-pointer items-center gap-1 rounded px-2 text-[10px] font-medium text-slate-400 hover:text-slate-100">
              <input
                type="checkbox"
                checked={showCash}
                onChange={(event) => onShowCashChange(event.target.checked)}
                className="h-3 w-3 rounded border-white/20 bg-panel text-neutral focus:ring-neutral/40"
              />
              Cash
            </label>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-white/10 bg-background/60 p-1">
            <select
              value={brokerFilter}
              onChange={(event) => onBrokerFilterChange(event.target.value)}
              className="h-6 w-40 rounded bg-background px-1.5 text-[10px] font-medium leading-none text-slate-300 outline-none hover:text-slate-100"
              aria-label="Filter holdings by exchange"
              title="Filter holdings by exchange"
            >
              <option className="bg-background text-slate-100" value="ALL">
                All
              </option>
              {brokerOptions.map((broker) => (
                <option className="bg-background text-slate-100" key={broker} value={broker}>
                  {broker}
                </option>
              ))}
            </select>
          </div>
        </div>
        <span className="text-xs text-slate-500">
          {costBasisMethod} MVP view · {portfolioCurrency}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="border-b border-white/10 pb-2 font-medium">Asset</th>
              <th className="border-b border-white/10 pb-2 font-medium">Type</th>
              <th className="border-b border-white/10 pb-2 text-right font-medium">Latest price</th>
              <th className="border-b border-white/10 pb-2 text-right font-medium">
                Value {portfolioCurrency}
              </th>
              <th className="border-b border-white/10 pb-2 text-right font-medium">Alloc.</th>
              <th className="border-b border-white/10 pb-2 text-right font-medium">Day</th>
              <th className="border-b border-white/10 pb-2 text-right font-medium">Return</th>
            </tr>
          </thead>
          <tbody>
            {visibleHoldings.map((holding) => (
              <tr key={holding.assetId} className="text-slate-200">
                <td className="border-b border-white/5 py-0.5">
                  <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                    {holding.type === "CASH" ? (
                      <CashHoldingActions
                        holding={holding}
                        portfolioCurrency={portfolioCurrency}
                        portfolioRange={portfolioRange}
                        openMenuAssetId={openMenuAssetId}
                        onOpenMenuChange={setOpenMenuAssetId}
                        onPortfolioRangeChange={onPortfolioRangeChange}
                      />
                    ) : (
                      <HoldingActions
                        holding={holding}
                        portfolioCurrency={portfolioCurrency}
                        openMenuAssetId={openMenuAssetId}
                        onOpenMenuChange={setOpenMenuAssetId}
                      />
                    )}
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-semibold">{holding.symbol}</span>
                      <span className="min-w-0 truncate text-[11px] text-slate-500">
                        {holding.name} · {holding.broker}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="border-b border-white/5 py-0.5 text-slate-400">{holding.type}</td>
                <td className="border-b border-white/5 py-0.5 text-right font-mono tabular">
                  {formatCurrencyAmount(holding.latestPrice, holding.currency)}
                </td>
                <td className="border-b border-white/5 py-0.5 text-right font-mono tabular">
                  {formatCurrencyNumber(holding.valueCzk)}
                </td>
                <td className="border-b border-white/5 py-0.5 text-right font-mono tabular">
                  {formatPercent(holding.allocation, defaultNumberFormatPreferences, { sign: "never" })}
                </td>
                <td
                  className={cn(
                    "border-b border-white/5 py-0.5 text-right font-mono tabular",
                    holding.dayChange >= 0 ? "text-positive" : "text-negative",
                  )}
                >
                  {formatPercent(holding.dayChange, defaultNumberFormatPreferences, { sign: "always" })}
                </td>
                <td
                  className={cn(
                    "border-b border-white/5 py-0.5 text-right font-mono tabular",
                    holding.totalReturn >= 0 ? "text-positive" : "text-negative",
                  )}
                >
                  {formatPercent(holding.totalReturn, defaultNumberFormatPreferences, { sign: "always" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
