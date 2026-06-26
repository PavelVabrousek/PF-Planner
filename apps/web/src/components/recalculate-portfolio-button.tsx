"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, CheckCircle2, Loader2, RefreshCw, X, XCircle } from "lucide-react";
import { IconTooltip } from "@/components/icon-tooltip";
import { defaultNumberFormatPreferences, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type MarketDataMode = "full" | "incremental";

type RecalculateSummary = {
  assetsScanned: number;
  assetsUpdated: number;
  dailyPricesUpserted: number;
  corporateActionsUpserted: number;
  fxRatesUpserted: number;
  warnings: string[];
};

type ProgressEvent =
  | { type: "preparing"; message: string }
  | { type: "start"; portfolioName: string; totalAssets: number }
  | { type: "asset-start"; symbol: string; index: number; totalAssets: number }
  | {
      type: "asset-complete";
      symbol: string;
      index: number;
      totalAssets: number;
      providerSymbol: string | null;
      dailyPricesUpserted: number;
      corporateActionsUpserted: number;
    }
  | { type: "asset-warning"; symbol: string; index: number; totalAssets: number; warning: string }
  | { type: "fx-start"; currencies: string[] }
  | { type: "fx-complete"; fxRatesUpserted: number }
  | { type: "complete"; summary: RecalculateSummary }
  | { type: "error"; error: string };

type RecalculateState = "idle" | "running" | "done" | "error";

function parseProgressLine(line: string): ProgressEvent | null {
  try {
    return JSON.parse(line) as ProgressEvent;
  } catch {
    return null;
  }
}

type RecalculatePortfolioButtonProps = {
  mode?: MarketDataMode;
  label?: string;
};

export function RecalculatePortfolioButton({
  mode = "full",
  label = "Recalculate portfolio",
}: RecalculatePortfolioButtonProps) {
  const [status, setStatus] = useState<RecalculateState>("idle");
  const [isOpen, setIsOpen] = useState(false);
  const [portfolioName, setPortfolioName] = useState("Portfolio");
  const [currentTicker, setCurrentTicker] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState("Ready");
  const [processedAssets, setProcessedAssets] = useState(0);
  const [totalAssets, setTotalAssets] = useState(0);
  const [priceRows, setPriceRows] = useState(0);
  const [actionRows, setActionRows] = useState(0);
  const [fxRows, setFxRows] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [summary, setSummary] = useState<RecalculateSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tooltipLabel = mode === "incremental" ? "Update market data" : "Recalculate portfolio";

  useEffect(() => {
    if (!isOpen || status !== "done") {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsOpen(false);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [isOpen, status]);

  const progress = useMemo(() => {
    if (totalAssets <= 0) {
      return status === "done" ? 100 : status === "running" ? 3 : 0;
    }

    return Math.min(100, Math.round((processedAssets / totalAssets) * 100));
  }, [processedAssets, status, totalAssets]);

  function resetProgress() {
    setPortfolioName("Portfolio");
    setCurrentTicker(null);
    setCurrentStep(mode === "incremental" ? "Preparing incremental update" : "Preparing recalculation");
    setProcessedAssets(0);
    setTotalAssets(0);
    setPriceRows(0);
    setActionRows(0);
    setFxRows(0);
    setWarnings([]);
    setSummary(null);
    setError(null);
  }

  function applyEvent(event: ProgressEvent) {
    if (event.type === "preparing") {
      setCurrentStep(event.message);
    }

    if (event.type === "start") {
      setPortfolioName(event.portfolioName);
      setTotalAssets(event.totalAssets);
      setCurrentStep("Starting market data refresh");
    }

    if (event.type === "asset-start") {
      setCurrentTicker(event.symbol);
      setTotalAssets(event.totalAssets);
      setCurrentStep(`Fetching ${event.symbol}`);
    }

    if (event.type === "asset-complete") {
      setProcessedAssets(event.index);
      setCurrentTicker(event.symbol);
      setCurrentStep(`${event.symbol} updated${event.providerSymbol ? ` via ${event.providerSymbol}` : ""}`);
      setPriceRows((value) => value + event.dailyPricesUpserted);
      setActionRows((value) => value + event.corporateActionsUpserted);
    }

    if (event.type === "asset-warning") {
      setProcessedAssets(event.index);
      setCurrentTicker(event.symbol);
      setCurrentStep(event.warning);
      setWarnings((value) => [...value, event.warning]);
    }

    if (event.type === "fx-start") {
      setCurrentTicker("FX");
      setCurrentStep(`Refreshing FX rates for ${event.currencies.join(", ")}`);
    }

    if (event.type === "fx-complete") {
      setFxRows(event.fxRatesUpserted);
      setCurrentStep("FX rates updated");
    }

    if (event.type === "complete") {
      setSummary(event.summary);
      setProcessedAssets(event.summary.assetsScanned);
      setPriceRows(event.summary.dailyPricesUpserted);
      setActionRows(event.summary.corporateActionsUpserted);
      setFxRows(event.summary.fxRatesUpserted);
      setWarnings(event.summary.warnings);
      setCurrentTicker(null);
      setCurrentStep("Recalculation complete");
      setStatus("done");
    }

    if (event.type === "error") {
      setError(event.error);
      setCurrentStep("Recalculation failed");
      setStatus("error");
    }
  }

  async function recalculate() {
    resetProgress();
    setStatus("running");
    setIsOpen(true);

    try {
      const response = await fetch(`/api/recalculate-portfolio?mode=${mode}`, {
        method: "POST",
      });

      if (!response.ok || !response.body) {
        throw new Error("Recalculation failed to start");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const event = parseProgressLine(line.trim());

          if (event) {
            applyEvent(event);
          }
        }
      }

      if (buffer.trim()) {
        const event = parseProgressLine(buffer.trim());

        if (event) {
          applyEvent(event);
        }
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Recalculation failed");
      setStatus("error");
      setCurrentStep("Recalculation failed");
    }
  }

  return (
    <>
      <div className="flex items-center">
        <IconTooltip label={tooltipLabel}>
          <button
            type="button"
            aria-label={label}
            title={tooltipLabel}
            onClick={recalculate}
            disabled={status === "running"}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-panel text-slate-200 hover:border-neutral/50 hover:text-slate-50 disabled:cursor-wait disabled:opacity-70 sm:h-9 sm:w-9",
              status === "done" && "border-positive/40 text-positive",
              status === "error" && "border-negative/40 text-negative",
            )}
          >
            {status === "running" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : mode === "incremental" ? (
              <RefreshCw size={15} />
            ) : (
              <Calculator size={15} />
            )}
          </button>
        </IconTooltip>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 grid min-h-screen place-items-center bg-black/55 px-4 py-6 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-lg border border-white/10 bg-panel p-4 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  {mode === "incremental" ? "Update" : "Recalculate"}
                </p>
                <h2 className="text-base font-semibold text-slate-50">{portfolioName}</h2>
              </div>
              <button
                type="button"
                aria-label="Close recalculation status"
                onClick={() => setIsOpen(false)}
                disabled={status === "running"}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X size={15} />
              </button>
            </div>

            <div className="mt-4 rounded-md bg-surface/70 p-3">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
                    status === "done" && "bg-positive/10 text-positive",
                    status === "error" && "bg-negative/10 text-negative",
                    status === "running" && "bg-neutral/10 text-blue-300",
                  )}
                >
                  {status === "done" ? (
                    <CheckCircle2 size={18} />
                  ) : status === "error" ? (
                    <XCircle size={18} />
                  ) : (
                    <Loader2 size={18} className="animate-spin" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">Current asset</p>
                  <p className="truncate font-mono text-lg font-semibold tabular text-slate-50">
                    {currentTicker ?? (status === "done" ? "Done" : "Preparing")}
                  </p>
                </div>
              </div>

              <p className="mt-3 min-h-4 truncate text-xs text-slate-400" title={error ?? currentStep}>
                {error ?? currentStep}
              </p>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    status === "error" ? "bg-negative" : "bg-neutral",
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between font-mono text-[11px] tabular text-slate-500">
                <span>
                  {formatNumber(processedAssets)}/{totalAssets ? formatNumber(totalAssets) : "-"} assets
                </span>
                <span>{formatPercent(progress, defaultNumberFormatPreferences, { sign: "never" })}</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-white/10 bg-background/50 p-2">
                <p className="font-mono text-sm font-semibold tabular text-slate-50">{formatNumber(priceRows)}</p>
                <p className="text-[10px] text-slate-500">prices</p>
              </div>
              <div className="rounded-md border border-white/10 bg-background/50 p-2">
                <p className="font-mono text-sm font-semibold tabular text-slate-50">{formatNumber(actionRows)}</p>
                <p className="text-[10px] text-slate-500">actions</p>
              </div>
              <div className="rounded-md border border-white/10 bg-background/50 p-2">
                <p className="font-mono text-sm font-semibold tabular text-slate-50">{formatNumber(fxRows)}</p>
                <p className="text-[10px] text-slate-500">FX rates</p>
              </div>
            </div>

            {warnings.length > 0 ? (
              <div className="mt-3 rounded-md border border-warning/20 bg-warning/10 p-2 text-[11px] text-warning">
                {warnings.slice(0, 2).join(" ")}
              </div>
            ) : null}

            {summary ? (
              <p className="mt-3 text-xs text-slate-400">
                Updated {formatNumber(summary.assetsUpdated)}/{formatNumber(summary.assetsScanned)} assets.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
