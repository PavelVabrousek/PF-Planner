"use client";

import { type PointerEvent, useMemo, useState } from "react";
import { ArrowDownUp, CircleDollarSign, X } from "lucide-react";
import {
  defaultNumberFormatPreferences,
  formatCurrencyAmount,
  formatCurrencyNumber,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import type { DashboardData } from "@/lib/portfolio-data";
import { cn } from "@/lib/utils";

type DividendSortKey = "date" | "asset" | "currency" | "value";
type SortDirection = "asc" | "desc";

type DividendRow = {
  id: string;
  asset: string;
  assetName: string;
  date: string;
  source: string;
  currency: string;
  portfolioCurrency: string;
  quantity: number | null;
  amountPerShare: number | null;
  grossAmount: number;
  netAmount: number;
  grossAmountPortfolio: number | null;
  returnImpactPercent: number | null;
};

function buildDividendRows(holdings: DashboardData["holdings"]): DividendRow[] {
  return holdings.flatMap((holding) =>
    holding.dividendHistory.map((row) => ({
      id: `${holding.assetId}-${row.id}`,
      asset: holding.symbol,
      assetName: holding.name,
      date: row.date,
      source: row.source,
      currency: row.currency,
      portfolioCurrency: row.portfolioCurrency,
      quantity: row.quantity,
      amountPerShare: row.amountPerShare,
      grossAmount: row.grossAmount,
      netAmount: row.netAmount,
      grossAmountPortfolio: row.grossAmountPortfolio,
      returnImpactPercent: row.returnImpactPercent,
    })),
  );
}

function compareRows(left: DividendRow, right: DividendRow, sortKey: DividendSortKey) {
  if (sortKey === "asset") {
    return left.asset.localeCompare(right.asset) || left.date.localeCompare(right.date);
  }

  if (sortKey === "currency") {
    return left.currency.localeCompare(right.currency) || left.asset.localeCompare(right.asset);
  }

  if (sortKey === "value") {
    return (left.grossAmountPortfolio ?? 0) - (right.grossAmountPortfolio ?? 0);
  }

  return left.date.localeCompare(right.date);
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

export function DividendsWindowButton({
  holdings,
  portfolioCurrency,
}: {
  holdings: DashboardData["holdings"];
  portfolioCurrency: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [assetFilter, setAssetFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [yearFilter, setYearFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<DividendSortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [position, setPosition] = useState({ x: 84, y: 112 });
  const [drag, setDrag] = useState<{
    originX: number;
    originY: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);
  const rows = useMemo(() => buildDividendRows(holdings), [holdings]);
  const assets = useMemo(() => uniqueSorted(rows.map((row) => row.asset)), [rows]);
  const currencies = useMemo(() => uniqueSorted(rows.map((row) => row.currency)), [rows]);
  const years = useMemo(() => uniqueSorted(rows.map((row) => row.date.slice(0, 4))).reverse(), [rows]);
  const filteredRows = useMemo(() => {
    return rows
      .filter((row) => assetFilter === "ALL" || row.asset === assetFilter)
      .filter((row) => currencyFilter === "ALL" || row.currency === currencyFilter)
      .filter((row) => yearFilter === "ALL" || row.date.startsWith(yearFilter))
      .sort((left, right) => {
        const result = compareRows(left, right, sortKey);
        return sortDirection === "asc" ? result : -result;
      });
  }, [assetFilter, currencyFilter, rows, sortDirection, sortKey, yearFilter]);
  const totalPortfolioValue = filteredRows.reduce((sum, row) => sum + (row.grossAmountPortfolio ?? 0), 0);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    setDrag({
      originX: position.x,
      originY: position.y,
      pointerX: event.clientX,
      pointerY: event.clientY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag) {
      return;
    }

    const maxX = Math.max(8, window.innerWidth - 320);
    const maxY = Math.max(8, window.innerHeight - 120);

    setPosition({
      x: Math.min(Math.max(8, drag.originX + event.clientX - drag.pointerX), maxX),
      y: Math.min(Math.max(8, drag.originY + event.clientY - drag.pointerY), maxY),
    });
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDrag(null);
  }

  function changeSort(nextSortKey: DividendSortKey) {
    if (nextSortKey === sortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "date" || nextSortKey === "value" ? "desc" : "asc");
  }

  return (
    <>
      <button
        type="button"
        aria-label="Open dividends table"
        title="Open dividends table"
        onClick={() => setIsOpen(true)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-teal-300/30 bg-teal-500/15 text-teal-200 hover:border-teal-200/60 hover:bg-teal-500/25 hover:text-teal-100"
      >
        <CircleDollarSign size={16} />
      </button>

      {isOpen ? (
        <section
          className="fixed z-[80] max-h-[min(76vh,620px)] w-[min(860px,calc(100vw-1rem))] min-w-[min(600px,calc(100vw-1rem))] resize overflow-auto rounded-lg border border-teal-300/20 bg-panel text-left shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          style={{ left: position.x, top: position.y }}
        >
          <div
            className="sticky top-0 z-10 flex cursor-move touch-none items-center justify-between gap-3 border-b border-teal-300/10 bg-panel/95 px-3 py-2 backdrop-blur"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-teal-300/80">Dividends</p>
              <h2 className="truncate text-sm font-semibold text-slate-50">
                {formatCurrencyAmount(totalPortfolioValue, portfolioCurrency)} filtered
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <span className="hidden rounded bg-background px-2 py-1 font-mono text-[10px] text-slate-400 sm:inline">
                {formatNumber(filteredRows.length)} rows
              </span>
              <button
                type="button"
                aria-label="Close dividends table"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setIsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-slate-50"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="space-y-2.5 p-3">
            <div className="grid gap-2 text-xs sm:grid-cols-[1fr_1fr_1fr_auto]">
              <select
                value={assetFilter}
                onChange={(event) => setAssetFilter(event.target.value)}
                className="h-8 rounded-md border border-white/10 bg-background px-2 text-xs text-slate-100 outline-none"
                aria-label="Filter dividends by asset"
              >
                <option value="ALL">All assets</option>
                {assets.map((asset) => (
                  <option key={asset} value={asset}>
                    {asset}
                  </option>
                ))}
              </select>
              <select
                value={currencyFilter}
                onChange={(event) => setCurrencyFilter(event.target.value)}
                className="h-8 rounded-md border border-white/10 bg-background px-2 text-xs text-slate-100 outline-none"
                aria-label="Filter dividends by currency"
              >
                <option value="ALL">All currencies</option>
                {currencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
              <select
                value={yearFilter}
                onChange={(event) => setYearFilter(event.target.value)}
                className="h-8 rounded-md border border-white/10 bg-background px-2 text-xs text-slate-100 outline-none"
                aria-label="Filter dividends by year"
              >
                <option value="ALL">All years</option>
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))}
                className="flex h-8 items-center justify-center gap-1 rounded-md border border-white/10 px-2 text-xs text-slate-300 hover:border-teal-300/40 hover:text-slate-50"
              >
                <ArrowDownUp size={13} />
                {sortDirection.toUpperCase()}
              </button>
            </div>

            <div className="overflow-x-auto rounded-md border border-white/10">
              <table className="w-full min-w-[780px] border-collapse text-left text-[10px]">
                <thead className="bg-background text-slate-500">
                  <tr>
                    {[
                      ["date", "Date"],
                      ["asset", "Asset"],
                      ["currency", "Currency"],
                      ["quantity", "Qty"],
                      ["perShare", "Per share"],
                      ["gross", "Gross"],
                      ["net", "Net"],
                      ["value", portfolioCurrency],
                      ["impact", "Impact"],
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        className={cn(
                          "border-b border-white/5 px-2 py-1.5 font-medium",
                          key !== "date" && key !== "asset" && "text-right",
                        )}
                      >
                        {key === "date" || key === "asset" || key === "currency" || key === "value" ? (
                          <button
                            type="button"
                            onClick={() => changeSort(key as DividendSortKey)}
                            className="inline-flex items-center gap-1 hover:text-slate-200"
                          >
                            {label}
                            {sortKey === key ? <span>{sortDirection === "asc" ? "↑" : "↓"}</span> : null}
                          </button>
                        ) : (
                          label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length > 0 ? (
                    filteredRows.map((row) => (
                      <tr key={row.id} className="border-t border-white/5">
                        <td className="whitespace-nowrap px-2 py-1.5 font-mono text-slate-300">{row.date}</td>
                        <td className="max-w-44 px-2 py-1.5">
                          <span className="font-semibold text-slate-100">{row.asset}</span>
                          <span className="ml-1 text-slate-500">{row.assetName}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-slate-300">{row.currency}</td>
                        <td className="px-2 py-1.5 text-right font-mono tabular text-slate-300">
                          {formatNumber(row.quantity)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular text-slate-100">
                          {formatCurrencyAmount(row.amountPerShare, row.currency)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular text-slate-100">
                          {formatCurrencyAmount(row.grossAmount, row.currency)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular text-slate-100">
                          {formatCurrencyAmount(row.netAmount, row.currency)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular text-slate-50">
                          {formatCurrencyNumber(row.grossAmountPortfolio)}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 text-right font-mono tabular",
                            (row.returnImpactPercent ?? 0) >= 0 ? "text-positive" : "text-negative",
                          )}
                        >
                          {formatPercent(row.returnImpactPercent, defaultNumberFormatPreferences, { sign: "always" })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-xs text-slate-500">
                        No dividend rows match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
