"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Loader2, Plus, Search, X } from "lucide-react";
import { defaultNumberFormatPreferences, formatCurrencyAmount, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type TransactionType = "BUY" | "SELL" | "CASH_DEPOSIT" | "CASH_WITHDRAWAL" | "FX_CONVERSION";

type AssetSearchResult = {
  id: string;
  symbol: string;
  isin: string | null;
  name: string | null;
  broker: string;
  currency: string;
  assetType: string;
  providerSymbol: string | null;
  latestPrice: number | null;
  latestPriceDate: string | null;
  latestPriceCurrency: string;
};

type HoldingOption = {
  assetId: string;
  symbol: string;
  name: string | null;
  broker: string;
  currency: string;
  assetType: string;
  quantity: number;
  latestPrice: number | null;
  latestPriceCurrency: string;
};

type CashAccount = {
  id: string;
  broker: string;
  currency: string;
  name: string | null;
  balance: number;
};

type TransactionContext = {
  portfolio: {
    id: string;
    name: string;
    base_currency: string;
  };
  holdings: HoldingOption[];
  cashAccounts: CashAccount[];
};

type SaveState = "idle" | "loading" | "saving" | "saved" | "error";

const transactionTypes = [
  { id: "BUY", label: "Buy" },
  { id: "SELL", label: "Sell" },
  { id: "CASH_DEPOSIT", label: "Deposit" },
  { id: "CASH_WITHDRAWAL", label: "Withdrawal" },
  { id: "FX_CONVERSION", label: "FX" },
] satisfies Array<{ id: TransactionType; label: string }>;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function numberInputValue(value: number | null) {
  return value === null || !Number.isFinite(value) ? "" : String(value);
}

function parsePositive(value: string) {
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function selectedCashAccount(
  cashAccounts: CashAccount[],
  id: string,
  fallbackCurrency: string,
): { id?: string; broker: string; currency: string } {
  const account = cashAccounts.find((item) => item.id === id);

  if (account) {
    return { id: account.id, broker: account.broker, currency: account.currency };
  }

  return { broker: "MANUAL", currency: fallbackCurrency };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function inputClassName(extra?: string) {
  return cn(
    "h-9 w-full rounded-md border border-white/10 bg-background px-2 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-neutral/60",
    extra,
  );
}

export function TransactionButton({ portfolioCurrency }: { portfolioCurrency: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<TransactionContext | null>(null);
  const [type, setType] = useState<TransactionType>("BUY");
  const [tradeDate, setTradeDate] = useState(todayKey());
  const [assetQuery, setAssetQuery] = useState("");
  const [assetResults, setAssetResults] = useState<AssetSearchResult[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<AssetSearchResult | null>(null);
  const [selectedHoldingId, setSelectedHoldingId] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [toCashAccountId, setToCashAccountId] = useState("");
  const [manualBroker, setManualBroker] = useState("MANUAL");
  const [manualCurrency, setManualCurrency] = useState(portfolioCurrency);
  const [toManualBroker, setToManualBroker] = useState("MANUAL");
  const [toManualCurrency, setToManualCurrency] = useState(portfolioCurrency === "CZK" ? "EUR" : portfolioCurrency);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fee, setFee] = useState("0");
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");

  const selectedHolding = useMemo(
    () => context?.holdings.find((holding) => holding.assetId === selectedHoldingId) ?? null,
    [context, selectedHoldingId],
  );
  const grossAmount = useMemo(() => {
    const parsedAmount = parsePositive(amount);

    if (parsedAmount !== null) {
      return parsedAmount;
    }

    const parsedQuantity = parsePositive(quantity);
    const parsedPrice = parsePositive(price);

    return parsedQuantity !== null && parsedPrice !== null ? parsedQuantity * parsedPrice : null;
  }, [amount, price, quantity]);
  const activeCurrency =
    type === "SELL"
      ? selectedHolding?.currency ?? portfolioCurrency
      : selectedAsset?.currency ?? manualCurrency ?? portfolioCurrency;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isCancelled = false;
    setStatus("loading");
    setError(null);

    fetch("/api/transactions/context")
      .then(async (response) => {
        const payload = (await response.json()) as TransactionContext & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Transaction context could not be loaded.");
        }

        return payload;
      })
      .then((payload) => {
        if (isCancelled) {
          return;
        }

        setContext(payload);
        const firstCash = payload.cashAccounts[0];
        const firstHolding = payload.holdings[0];
        setCashAccountId(firstCash?.id ?? "");
        setToCashAccountId(payload.cashAccounts[1]?.id ?? firstCash?.id ?? "");
        setManualCurrency(firstCash?.currency ?? payload.portfolio.base_currency ?? portfolioCurrency);
        setSelectedHoldingId(firstHolding?.assetId ?? "");
        setStatus("idle");
      })
      .catch((caughtError) => {
        if (!isCancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Transaction context could not be loaded.");
          setStatus("error");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, portfolioCurrency]);

  useEffect(() => {
    if (!isOpen || type !== "BUY" || assetQuery.trim().length < 2) {
      setAssetResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/assets/search?q=${encodeURIComponent(assetQuery.trim())}`, { signal: controller.signal })
        .then(async (response) => {
          const payload = (await response.json()) as { assets?: AssetSearchResult[]; error?: string };

          if (!response.ok) {
            throw new Error(payload.error ?? "Asset search failed.");
          }

          return payload.assets ?? [];
        })
        .then(setAssetResults)
        .catch((caughtError) => {
          if (!controller.signal.aborted) {
            setError(caughtError instanceof Error ? caughtError.message : "Asset search failed.");
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [assetQuery, isOpen, type]);

  function chooseAsset(asset: AssetSearchResult) {
    setSelectedAsset(asset);
    setAssetQuery(`${asset.symbol}${asset.name ? ` · ${asset.name}` : ""}`);
    setAssetResults([]);
    setManualCurrency(asset.currency);

    if (asset.latestPrice) {
      setPrice(numberInputValue(asset.latestPrice));
    }
  }

  function chooseHolding(assetId: string) {
    const holding = context?.holdings.find((item) => item.assetId === assetId) ?? null;
    setSelectedHoldingId(assetId);
    setSelectedAsset(null);
    setManualCurrency(holding?.currency ?? portfolioCurrency);

    if (holding?.latestPrice) {
      setPrice(numberInputValue(holding.latestPrice));
    }
  }

  function resetAfterSave() {
    setQuantity("");
    setAmount("");
    setToAmount("");
    setFee("0");
    setTax("0");
    setNotes("");
  }

  async function saveTransaction() {
    setStatus("saving");
    setError(null);

    const fromCash = selectedCashAccount(context?.cashAccounts ?? [], cashAccountId, manualCurrency);
    const assetId = type === "SELL" ? selectedHolding?.assetId : selectedAsset?.id;
    const payload =
      type === "FX_CONVERSION"
        ? {
            type,
            tradeDate,
            cashAccount: cashAccountId ? { id: cashAccountId } : { broker: manualBroker, currency: manualCurrency },
            toCashAccount: toCashAccountId
              ? { id: toCashAccountId }
              : { broker: toManualBroker, currency: toManualCurrency },
            grossAmount: amount,
            toAmount,
            fee,
            notes,
          }
        : type === "CASH_DEPOSIT" || type === "CASH_WITHDRAWAL"
          ? {
              type,
              tradeDate,
              cashAccount: cashAccountId ? { id: cashAccountId } : { broker: manualBroker, currency: manualCurrency },
              grossAmount: amount,
              fee,
              tax,
              notes,
            }
          : {
              type,
              tradeDate,
              assetId,
              quantity,
              price,
              grossAmount,
              currency: type === "SELL" ? selectedHolding?.currency : selectedAsset?.currency,
              cashAccount: cashAccountId ? { id: fromCash.id } : { broker: fromCash.broker, currency: fromCash.currency },
              fee,
              tax,
              notes,
            };

    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Transaction could not be saved.");
      }

      setStatus("saved");
      resetAfterSave();
      window.setTimeout(() => {
        window.location.reload();
      }, 650);
    } catch (caughtError) {
      setStatus("error");
      setError(caughtError instanceof Error ? caughtError.message : "Transaction could not be saved.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-9 items-center gap-2 rounded-md bg-neutral px-3 text-xs font-medium text-white hover:bg-blue-500"
      >
        <Plus size={16} />
        <span className="hidden sm:inline">Transaction</span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 grid min-h-screen place-items-center bg-black/55 px-3 py-4 backdrop-blur-sm">
          <section className="w-full max-w-2xl rounded-lg border border-white/10 bg-panel text-left shadow-panel">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Manual entry</p>
                <h2 className="text-base font-semibold text-slate-50">New transaction</h2>
              </div>
              <button
                type="button"
                aria-label="Close transaction form"
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-slate-50"
              >
                <X size={15} />
              </button>
            </div>

            <div className="max-h-[calc(100vh-9rem)] overflow-y-auto px-4 py-3">
              <fieldset className="grid grid-cols-5 gap-1 rounded-md border border-white/10 bg-background/60 p-1">
                <legend className="sr-only">Transaction type</legend>
                {transactionTypes.map((item) => (
                  <label
                    key={item.id}
                    className={cn(
                      "flex h-8 cursor-pointer items-center justify-center rounded px-1 text-[10px] font-medium",
                      type === item.id ? "bg-neutral/20 text-blue-200" : "text-slate-500 hover:text-slate-200",
                    )}
                  >
                    <input
                      type="radio"
                      name="transaction-type"
                      value={item.id}
                      checked={type === item.id}
                      onChange={() => setType(item.id)}
                      className="sr-only"
                    />
                    {item.label}
                  </label>
                ))}
              </fieldset>

              {status === "loading" ? (
                <div className="mt-4 flex items-center gap-2 rounded-md bg-surface/70 px-3 py-2 text-sm text-slate-400">
                  <Loader2 size={15} className="animate-spin" />
                  Loading portfolio context
                </div>
              ) : null}

              {error ? (
                <div className="mt-4 rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-red-200">
                  {error}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_1fr]">
                <Field label="Date">
                  <input
                    type="date"
                    value={tradeDate}
                    onChange={(event) => setTradeDate(event.target.value)}
                    className={inputClassName()}
                  />
                </Field>
                <Field label="Fee">
                  <input value={fee} onChange={(event) => setFee(event.target.value)} className={inputClassName()} />
                </Field>
                <Field label="Tax">
                  <input value={tax} onChange={(event) => setTax(event.target.value)} className={inputClassName()} />
                </Field>
              </div>

              {type === "BUY" ? (
                <div className="mt-4 space-y-3">
                  <Field label="Search ticker or ISIN">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2 top-2.5 text-slate-500" size={14} />
                      <input
                        value={assetQuery}
                        onChange={(event) => {
                          setAssetQuery(event.target.value);
                          setSelectedAsset(null);
                        }}
                        placeholder="ASML, US5949181045..."
                        className={inputClassName("pl-7")}
                      />
                      {assetResults.length > 0 ? (
                        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-white/10 bg-background shadow-panel">
                          {assetResults.map((asset) => (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={() => chooseAsset(asset)}
                              className="flex w-full items-center justify-between gap-3 border-b border-white/5 px-3 py-2 text-left text-xs hover:bg-surface"
                            >
                              <span className="min-w-0">
                                <span className="font-semibold text-slate-100">{asset.symbol}</span>
                                <span className="ml-2 text-slate-500">{asset.name ?? asset.providerSymbol}</span>
                              </span>
                              <span className="shrink-0 font-mono text-slate-300">
                                {asset.latestPrice ? formatCurrencyAmount(asset.latestPrice, asset.currency) : asset.currency}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </Field>
                </div>
              ) : null}

              {type === "SELL" ? (
                <div className="mt-4">
                  <Field label="Holding">
                    <select
                      value={selectedHoldingId}
                      onChange={(event) => chooseHolding(event.target.value)}
                      className={inputClassName()}
                    >
                      {(context?.holdings ?? []).map((holding) => (
                        <option key={holding.assetId} value={holding.assetId}>
                          {holding.symbol} · {formatNumber(holding.quantity, defaultNumberFormatPreferences)} ·{" "}
                          {holding.currency}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              ) : null}

              {type === "BUY" || type === "SELL" ? (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Field label="Quantity">
                    <input value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClassName()} />
                  </Field>
                  <Field label={`Price ${activeCurrency}`}>
                    <input value={price} onChange={(event) => setPrice(event.target.value)} className={inputClassName()} />
                  </Field>
                  <Field label={`Gross ${activeCurrency}`}>
                    <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={grossAmount ? String(grossAmount) : ""} className={inputClassName()} />
                  </Field>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label={type === "FX_CONVERSION" ? "From cash account" : "Cash account"}>
                  <select value={cashAccountId} onChange={(event) => setCashAccountId(event.target.value)} className={inputClassName()}>
                    <option value="">New / manual account</option>
                    {(context?.cashAccounts ?? []).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.broker} · {account.currency} · {formatCurrencyAmount(account.balance, account.currency)}
                      </option>
                    ))}
                  </select>
                </Field>

                {type === "FX_CONVERSION" ? (
                  <Field label="To cash account">
                    <select value={toCashAccountId} onChange={(event) => setToCashAccountId(event.target.value)} className={inputClassName()}>
                      <option value="">New / manual account</option>
                      {(context?.cashAccounts ?? []).map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.broker} · {account.currency} · {formatCurrencyAmount(account.balance, account.currency)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </div>

              {!cashAccountId ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Field label="Broker">
                    <input value={manualBroker} onChange={(event) => setManualBroker(event.target.value)} className={inputClassName()} />
                  </Field>
                  <Field label="Currency">
                    <input value={manualCurrency} onChange={(event) => setManualCurrency(event.target.value.toUpperCase())} maxLength={3} className={inputClassName()} />
                  </Field>
                </div>
              ) : null}

              {type === "FX_CONVERSION" && !toCashAccountId ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Field label="Target broker">
                    <input value={toManualBroker} onChange={(event) => setToManualBroker(event.target.value)} className={inputClassName()} />
                  </Field>
                  <Field label="Target currency">
                    <input value={toManualCurrency} onChange={(event) => setToManualCurrency(event.target.value.toUpperCase())} maxLength={3} className={inputClassName()} />
                  </Field>
                </div>
              ) : null}

              {type === "CASH_DEPOSIT" || type === "CASH_WITHDRAWAL" || type === "FX_CONVERSION" ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Field label={type === "FX_CONVERSION" ? "Source amount" : "Amount"}>
                    <input value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClassName()} />
                  </Field>
                  {type === "FX_CONVERSION" ? (
                    <Field label="Target amount">
                      <input value={toAmount} onChange={(event) => setToAmount(event.target.value)} className={inputClassName()} />
                    </Field>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4">
                <Field label="Notes">
                  <input value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClassName()} />
                </Field>
              </div>

              <div className="mt-4 grid gap-2 rounded-md bg-surface/70 p-3 text-xs text-slate-400 md:grid-cols-3">
                <div>
                  <p className="text-[10px] text-slate-500">Portfolio</p>
                  <p className="truncate text-slate-200">{context?.portfolio.name ?? "Loading"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Selected</p>
                  <p className="truncate text-slate-200">
                    {type === "SELL"
                      ? selectedHolding?.symbol ?? "-"
                      : selectedAsset?.symbol ?? (type.startsWith("CASH") || type === "FX_CONVERSION" ? "Cash" : "-")}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Estimated gross</p>
                  <p className="font-mono text-slate-200">
                    {grossAmount ? formatCurrencyAmount(grossAmount, activeCurrency) : "-"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="h-9 rounded-md border border-white/10 px-3 text-xs font-medium text-slate-300 hover:text-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveTransaction}
                disabled={status === "loading" || status === "saving" || status === "saved"}
                className="flex h-9 items-center gap-2 rounded-md bg-neutral px-3 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-wait disabled:opacity-70"
              >
                {status === "saving" ? <Loader2 size={15} className="animate-spin" /> : status === "saved" ? <CheckCircle2 size={15} /> : <Plus size={15} />}
                {status === "saved" ? "Saved" : "Save transaction"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
