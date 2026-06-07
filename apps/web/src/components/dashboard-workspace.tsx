"use client";

import { useMemo, useState } from "react";
import { AllocationChart, PortfolioChart } from "@/components/portfolio-chart";
import { HoldingsTable } from "@/components/holdings-table";
import { formatCurrencyAmount, formatCurrencyNumber } from "@/lib/format";
import type { DashboardData } from "@/lib/portfolio-data";
import { cn } from "@/lib/utils";

type DashboardWorkspaceProps = Pick<
  DashboardData,
  | "source"
  | "portfolioName"
  | "baseCurrency"
  | "costBasisMethod"
  | "portfolioSeries"
  | "filteredPortfolioSeries"
  | "holdings"
  | "transactions"
>;

export function DashboardWorkspace({
  source,
  portfolioName,
  baseCurrency,
  costBasisMethod,
  portfolioSeries,
  filteredPortfolioSeries,
  holdings,
  transactions,
}: DashboardWorkspaceProps) {
  const [brokerFilter, setBrokerFilter] = useState("ALL");
  const [showHoldings, setShowHoldings] = useState(true);
  const [showCash, setShowCash] = useState(false);
  const scopedSeries = filteredPortfolioSeries[brokerFilter] ?? filteredPortfolioSeries.ALL;
  const chartData =
    showHoldings && showCash
      ? scopedSeries?.all ?? portfolioSeries
      : showHoldings
        ? scopedSeries?.holdings ?? portfolioSeries
        : showCash
          ? scopedSeries?.cash ?? []
          : [];
  const chartEyebrow =
    brokerFilter === "ALL"
      ? source === "supabase"
        ? "Live portfolio"
        : "Demo portfolio"
      : "Broker-filtered portfolio";
  const chartTitle = brokerFilter === "ALL" ? portfolioName : `${portfolioName} · ${brokerFilter}`;
  const brokerOptions = useMemo(
    () =>
      Array.from(new Set(holdings.map((holding) => holding.broker))).sort((left, right) =>
        left.localeCompare(right),
      ),
    [holdings],
  );

  return (
    <section className="grid flex-1 gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
      <div className="space-y-3">
        <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
          <PortfolioChart
            data={chartData}
            currency={baseCurrency}
            eyebrow={chartEyebrow}
            title={chartTitle}
          />
        </article>

        <HoldingsTable
          holdings={holdings}
          portfolioCurrency={baseCurrency}
          costBasisMethod={costBasisMethod}
          brokerFilter={brokerFilter}
          brokerOptions={brokerOptions}
          showHoldings={showHoldings}
          showCash={showCash}
          onBrokerFilterChange={setBrokerFilter}
          onShowHoldingsChange={setShowHoldings}
          onShowCashChange={setShowCash}
        />
      </div>

      <aside className="space-y-3">
        <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-50">Allocation</h2>
            <span className="rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-medium text-positive">
              Balanced
            </span>
          </div>
          <AllocationChart holdings={holdings} portfolioCurrency={baseCurrency} />
        </article>

        <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
          <h2 className="mb-3 text-sm font-semibold text-slate-50">Recent transactions</h2>
          <div className="overflow-x-auto rounded-md border border-white/5">
            <div className="min-w-[570px] space-y-1 p-1">
              <div className="grid grid-cols-[38px_48px_86px_72px_52px_56px_48px_86px] items-center gap-1 px-2 py-1 text-[9px] font-medium text-slate-500">
                <span>Type</span>
                <span>Asset</span>
                <span>Broker</span>
                <span>Date</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Price</span>
                <span className="text-right">Fee</span>
                <span className="text-right">Amount</span>
              </div>
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="grid grid-cols-[38px_48px_86px_72px_52px_56px_48px_86px] items-center gap-1 rounded bg-surface/70 px-2 py-1 text-[10px]"
                >
                  <span className="truncate font-mono text-slate-400" title={transaction.type}>
                    {transaction.type}
                  </span>
                  <span className="truncate font-semibold text-slate-100" title={transaction.symbol}>
                    {transaction.symbol}
                  </span>
                  <span className="truncate text-slate-500" title={transaction.broker}>
                    {transaction.broker}
                  </span>
                  <span className="font-mono tabular text-slate-500">{transaction.date}</span>
                  <span className="text-right font-mono tabular text-slate-400">
                    {transaction.quantity ? formatCurrencyNumber(transaction.quantity) : "-"}
                  </span>
                  <span className="text-right font-mono tabular text-slate-300">
                    {transaction.price ? formatCurrencyNumber(transaction.price) : "-"}
                  </span>
                  <span className="text-right font-mono tabular text-slate-400">
                    {transaction.fee ? formatCurrencyNumber(transaction.fee) : "-"}
                  </span>
                  <span
                    className={cn(
                      "text-right font-mono tabular",
                      transaction.amount >= 0 ? "text-positive" : "text-slate-200",
                    )}
                    title={`Qty ${transaction.quantity ?? "-"} · Volume ${formatCurrencyAmount(transaction.volume, transaction.currency)}`}
                  >
                    {formatCurrencyAmount(transaction.amount, transaction.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </article>
      </aside>
    </section>
  );
}
