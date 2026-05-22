"use client";

import { useMemo, useState } from "react";
import { HoldingActions } from "@/components/holding-actions";
import { defaultNumberFormatPreferences, formatCurrencyAmount, formatCurrencyNumber, formatPercent } from "@/lib/format";
import type { DashboardData } from "@/lib/portfolio-data";
import { cn } from "@/lib/utils";

type HoldingsTableProps = {
  holdings: DashboardData["holdings"];
  portfolioCurrency: string;
  costBasisMethod: string;
};

export function HoldingsTable({ holdings, portfolioCurrency, costBasisMethod }: HoldingsTableProps) {
  const [showHoldings, setShowHoldings] = useState(true);
  const [showCash, setShowCash] = useState(false);
  const [openMenuAssetId, setOpenMenuAssetId] = useState<string | null>(null);
  const [brokerFilter, setBrokerFilter] = useState("ALL");
  const brokerOptions = useMemo(
    () => Array.from(new Set(holdings.map((holding) => holding.broker))).sort((left, right) => left.localeCompare(right)),
    [holdings],
  );
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
                onChange={(event) => setShowHoldings(event.target.checked)}
                className="h-3 w-3 rounded border-white/20 bg-panel text-neutral focus:ring-neutral/40"
              />
              Holdings
            </label>
            <label className="flex h-6 cursor-pointer items-center gap-1 rounded px-2 text-[10px] font-medium text-slate-400 hover:text-slate-100">
              <input
                type="checkbox"
                checked={showCash}
                onChange={(event) => setShowCash(event.target.checked)}
                className="h-3 w-3 rounded border-white/20 bg-panel text-neutral focus:ring-neutral/40"
              />
              Cash
            </label>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-white/10 bg-background/60 p-1">
            <select
              value={brokerFilter}
              onChange={(event) => setBrokerFilter(event.target.value)}
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
                      <span className="h-6 w-6 shrink-0 rounded-md border border-white/10 bg-surface" />
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
