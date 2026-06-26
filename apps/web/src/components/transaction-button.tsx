"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { CheckCircle2, Loader2, Plus, Search, X } from "lucide-react";
import { IconTooltip } from "@/components/icon-tooltip";
import { defaultNumberFormatPreferences, formatCurrencyAmount, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type TransactionType = "BUY" | "SELL" | "CASH_DEPOSIT" | "CASH_WITHDRAWAL" | "FX_CONVERSION";

type AssetSearchResult = {
  id: string | null;
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
  source: "database" | "nfin" | "yahoo";
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
type AssetSearchState = "idle" | "loading" | "ready" | "empty" | "error";
type FxRateState = "idle" | "loading" | "ready" | "error";

type FxRateResponse = {
  rate?: number;
  rateDate?: string;
  source?: string;
  error?: string;
};

type AssetPriceResponse = {
  price?: number;
  priceDate?: string;
  currency?: string;
  source?: string;
  error?: string;
};

const transactionTypes = [
  { id: "BUY", label: "Buy" },
  { id: "SELL", label: "Sell" },
  { id: "CASH_DEPOSIT", label: "Deposit" },
  { id: "CASH_WITHDRAWAL", label: "Withdrawal" },
  { id: "FX_CONVERSION", label: "FX" },
] satisfies Array<{ id: TransactionType; label: string }>;

const supportedCurrencies = [
  "AUD",
  "CAD",
  "CHF",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "HUF",
  "JPY",
  "NOK",
  "NZD",
  "PLN",
  "SEK",
  "USD",
] as const;

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

function uniqueCurrencies(currencies: string[]) {
  return Array.from(new Set(currencies.map((currency) => currency.toUpperCase()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );
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
  const [assetSearchState, setAssetSearchState] = useState<AssetSearchState>("idle");
  const [isAssetListOpen, setIsAssetListOpen] = useState(false);
  const [activeAssetIndex, setActiveAssetIndex] = useState(-1);
  const [selectedAsset, setSelectedAsset] = useState<AssetSearchResult | null>(null);
  const [selectedHoldingId, setSelectedHoldingId] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [toCashAccountId, setToCashAccountId] = useState("");
  const [manualBroker, setManualBroker] = useState("MANUAL");
  const [manualCurrency, setManualCurrency] = useState(portfolioCurrency);
  const [transactionCurrency, setTransactionCurrency] = useState(portfolioCurrency);
  const [toManualBroker, setToManualBroker] = useState("MANUAL");
  const [toManualCurrency, setToManualCurrency] = useState(portfolioCurrency === "CZK" ? "EUR" : portfolioCurrency);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [priceStatus, setPriceStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [priceSource, setPriceSource] = useState<string | null>(null);
  const [priceDate, setPriceDate] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [cashAccountValue, setCashAccountValue] = useState("");
  const [fxFeePercent, setFxFeePercent] = useState("1");
  const [fxRateState, setFxRateState] = useState<FxRateState>("idle");
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [fxRateDate, setFxRateDate] = useState<string | null>(null);
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
    const parsedFee = Number(fee.replace(/\s/g, "").replace(",", "."));
    const parsedTax = Number(tax.replace(/\s/g, "").replace(",", "."));
    const feeValue = Number.isFinite(parsedFee) && parsedFee > 0 ? parsedFee : 0;
    const taxValue = Number.isFinite(parsedTax) && parsedTax > 0 ? parsedTax : 0;

    return parsedQuantity !== null && parsedPrice !== null ? parsedQuantity * parsedPrice + feeValue + taxValue : null;
  }, [amount, fee, price, quantity, tax]);
  const activeCurrency =
    type === "FX_CONVERSION"
      ? manualCurrency
      : transactionCurrency;
  const selectedCashCurrency = useMemo(
    () =>
      selectedCashAccount(context?.cashAccounts ?? [], cashAccountId, manualCurrency).currency,
    [cashAccountId, context, manualCurrency],
  );
  const cashAccountCurrencies = useMemo(
    () => uniqueCurrencies((context?.cashAccounts ?? []).map((account) => account.currency)),
    [context],
  );
  const otherCurrencies = useMemo(
    () =>
      uniqueCurrencies(
        supportedCurrencies.filter(
          (currency) => currency !== selectedCashCurrency && !cashAccountCurrencies.includes(currency),
        ),
      ),
    [cashAccountCurrencies, selectedCashCurrency],
  );
  const secondaryCashCurrencies = useMemo(
    () => cashAccountCurrencies.filter((currency) => currency !== selectedCashCurrency),
    [cashAccountCurrencies, selectedCashCurrency],
  );
  const assetListId = "transaction-asset-search-results";
  const activeAssetId =
    activeAssetIndex >= 0 && assetResults[activeAssetIndex]
      ? `${assetListId}-${activeAssetIndex}`
      : undefined;
  const needsFxConversion =
    (type === "BUY" || type === "SELL") && activeCurrency !== selectedCashCurrency;
  const cashAccountGrossAmount = useMemo(() => parsePositive(cashAccountValue), [cashAccountValue]);
  const cannotSave =
    status === "loading" ||
    status === "saving" ||
    status === "saved" ||
    (needsFxConversion && cashAccountGrossAmount === null);

  function handleCashAccountChange(id: string) {
    const account = context?.cashAccounts.find((item) => item.id === id);
    setCashAccountId(id);

    if (account) {
      setManualCurrency(account.currency);
      setTransactionCurrency(account.currency);
    }
  }

  function handleTransactionCurrencyChange(currency: string) {
    const nextCurrency = currency.toUpperCase();
    setTransactionCurrency(nextCurrency);

    if (!cashAccountId) {
      setManualCurrency(nextCurrency);
    }
  }

  const selectedPriceAsset = useMemo(() => {
    if (type === "SELL" && selectedHolding) {
      return {
        assetId: selectedHolding.assetId,
        providerSymbol: selectedHolding.symbol,
        symbol: selectedHolding.symbol,
        currency: selectedHolding.currency,
      };
    }

    if (type === "BUY" && selectedAsset) {
      return {
        assetId: selectedAsset.id,
        providerSymbol: selectedAsset.providerSymbol ?? selectedAsset.symbol,
        symbol: selectedAsset.symbol,
        currency: selectedAsset.currency,
      };
    }

    return null;
  }, [selectedAsset, selectedHolding, type]);

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
        setTransactionCurrency(firstCash?.currency ?? payload.portfolio.base_currency ?? portfolioCurrency);
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
    if (!isOpen || !needsFxConversion) {
      setFxRateState("idle");
      setFxRate(null);
      setFxRateDate(null);
      setCashAccountValue("");
      return;
    }

    const controller = new AbortController();
    setFxRateState("loading");
    setFxRate(null);
    setFxRateDate(null);

    fetch(
      `/api/fx/rate?from=${encodeURIComponent(activeCurrency)}&to=${encodeURIComponent(selectedCashCurrency)}&date=${encodeURIComponent(tradeDate)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response.json()) as FxRateResponse;

        if (!response.ok || !payload.rate) {
          throw new Error(payload.error ?? "FX rate could not be loaded.");
        }

        return payload;
      })
      .then((payload) => {
        setFxRate(payload.rate ?? null);
        setFxRateDate(payload.rateDate ?? null);
        setFxRateState("ready");
      })
      .catch((caughtError) => {
        if (!controller.signal.aborted) {
          setFxRateState("error");
          setFxRate(null);
          setFxRateDate(null);
          setError(caughtError instanceof Error ? caughtError.message : "FX rate could not be loaded.");
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeCurrency, isOpen, needsFxConversion, selectedCashCurrency, tradeDate]);

  useEffect(() => {
    if (!isOpen || !selectedPriceAsset || !(type === "BUY" || type === "SELL")) {
      setPriceStatus("idle");
      setPriceSource(null);
      setPriceDate(null);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      date: tradeDate,
      currency: transactionCurrency,
    });

    if (selectedPriceAsset.assetId) {
      params.set("assetId", selectedPriceAsset.assetId);
    } else {
      params.set("symbol", selectedPriceAsset.symbol);
      params.set("providerSymbol", selectedPriceAsset.providerSymbol);
    }

    setPriceStatus("loading");
    setPriceSource(null);
    setPriceDate(null);

    fetch(`/api/assets/price?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as AssetPriceResponse;

        if (!response.ok || !payload.price) {
          throw new Error(payload.error ?? "Price could not be loaded.");
        }

        return payload;
      })
      .then((payload) => {
        setPrice(numberInputValue(payload.price ?? null));
        setPriceSource(payload.source ?? null);
        setPriceDate(payload.priceDate ?? null);
        setPriceStatus("ready");
      })
      .catch((caughtError) => {
        if (!controller.signal.aborted) {
          setPriceStatus("error");
          setPriceSource(null);
          setPriceDate(null);
          setError(caughtError instanceof Error ? caughtError.message : "Price could not be loaded.");
        }
      });

    return () => {
      controller.abort();
    };
  }, [isOpen, selectedPriceAsset, tradeDate, transactionCurrency, type]);

  useEffect(() => {
    if (!needsFxConversion || !grossAmount || !fxRate) {
      return;
    }

    const parsedFee = Number(fxFeePercent.replace(/\s/g, "").replace(",", "."));
    const feeMultiplier =
      Number.isFinite(parsedFee) && parsedFee >= 0
        ? type === "SELL"
          ? Math.max(0, 1 - parsedFee / 100)
          : 1 + parsedFee / 100
        : 1;
    const converted = grossAmount * fxRate * feeMultiplier;

    setCashAccountValue(numberInputValue(Number(converted.toFixed(8))));
  }, [fxFeePercent, fxRate, grossAmount, needsFxConversion, type]);

  function chooseAsset(asset: AssetSearchResult) {
    setSelectedAsset(asset);
    setAssetQuery(`${asset.symbol}${asset.name ? ` · ${asset.name}` : ""}`);
    setAssetResults([]);
    setIsAssetListOpen(false);
    setAssetSearchState("idle");
    setActiveAssetIndex(-1);
    setTransactionCurrency(asset.currency);

    if (asset.latestPrice) {
      setPrice(numberInputValue(asset.latestPrice));
    }
  }

  function handleAssetQueryChange(value: string) {
    setAssetQuery(value);
    setSelectedAsset(null);
    setAssetResults([]);
    setAssetSearchState("idle");
    setIsAssetListOpen(false);
    setActiveAssetIndex(-1);
  }

  async function runAssetSearch() {
    const query = assetQuery.trim();

    if (!isOpen || type !== "BUY" || query.length < 2) {
      setAssetResults([]);
      setAssetSearchState("idle");
      setIsAssetListOpen(false);
      setActiveAssetIndex(-1);
      return;
    }

    setError(null);
    setAssetSearchState("loading");
    setIsAssetListOpen(true);
    setActiveAssetIndex(-1);

    try {
      const response = await fetch(`/api/assets/search?q=${encodeURIComponent(query)}`);
      const payload = (await response.json()) as { assets?: AssetSearchResult[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Asset search failed.");
      }

      const assets = payload.assets ?? [];
      setAssetResults(assets);
      setAssetSearchState(assets.length > 0 ? "ready" : "empty");
      setActiveAssetIndex(assets.length > 0 ? 0 : -1);
    } catch (caughtError) {
      setAssetSearchState("error");
      setAssetResults([]);
      setError(caughtError instanceof Error ? caughtError.message : "Asset search failed.");
    }
  }

  function handleAssetSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isAssetListOpen && (event.key === "ArrowDown" || event.key === "ArrowUp") && assetResults.length > 0) {
      setIsAssetListOpen(true);
      return;
    }

    if (event.key === "ArrowDown" && assetResults.length > 0) {
      event.preventDefault();
      setActiveAssetIndex((index) => (index + 1) % assetResults.length);
      return;
    }

    if (event.key === "ArrowUp" && assetResults.length > 0) {
      event.preventDefault();
      setActiveAssetIndex((index) => (index <= 0 ? assetResults.length - 1 : index - 1));
      return;
    }

    if (event.key === "Enter" && isAssetListOpen && activeAssetIndex >= 0 && assetResults[activeAssetIndex]) {
      event.preventDefault();
      chooseAsset(assetResults[activeAssetIndex]);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void runAssetSearch();
      return;
    }

    if (event.key === "Escape") {
      setIsAssetListOpen(false);
      setActiveAssetIndex(-1);
    }
  }

  function chooseHolding(assetId: string) {
    const holding = context?.holdings.find((item) => item.assetId === assetId) ?? null;
    setSelectedHoldingId(assetId);
    setSelectedAsset(null);
    setTransactionCurrency(holding?.currency ?? portfolioCurrency);

    if (holding?.latestPrice) {
      setPrice(numberInputValue(holding.latestPrice));
    }
  }

  function resetAfterSave() {
    setQuantity("");
    setAmount("");
    setCashAccountValue("");
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
              assetCandidate: selectedAsset
                ? {
                    symbol: selectedAsset.symbol,
                    name: selectedAsset.name,
                    broker: selectedAsset.broker,
                    currency: selectedAsset.currency,
                    assetType: selectedAsset.assetType,
                    providerSymbol: selectedAsset.providerSymbol,
                    isin: selectedAsset.isin,
                  }
                : undefined,
              quantity,
              price,
              grossAmount,
              cashAccountGrossAmount: needsFxConversion ? cashAccountGrossAmount : undefined,
              tradeGrossAmount: grossAmount,
              grossAmountIncludesCosts: true,
              tradeCurrency: transactionCurrency,
              fxRate: needsFxConversion ? fxRate : undefined,
              fxFeePercent: needsFxConversion ? fxFeePercent : undefined,
              currency: transactionCurrency,
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
      <IconTooltip label="New transaction">
        <button
          type="button"
          aria-label="New transaction"
          title="New transaction"
          onClick={() => setIsOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral text-white hover:bg-blue-500 sm:h-9 sm:w-9"
        >
          <Plus size={16} />
        </button>
      </IconTooltip>

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

              <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_1fr_160px]">
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
                <Field label="Currency">
                  <select
                    value={transactionCurrency}
                    onChange={(event) => handleTransactionCurrencyChange(event.target.value)}
                    className={inputClassName()}
                  >
                    <optgroup label="Selected cash account">
                      <option value={selectedCashCurrency}>{selectedCashCurrency}</option>
                    </optgroup>
                    {secondaryCashCurrencies.length > 0 ? (
                      <optgroup label="Cash account currencies">
                        {secondaryCashCurrencies.map((currency) => (
                          <option key={currency} value={currency}>
                            {currency}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    <optgroup label="Other currencies">
                      {otherCurrencies.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </Field>
              </div>

              {type === "BUY" ? (
                <div className="mt-4 space-y-3">
                  <Field label="Search ticker or ISIN">
                    <div className="relative">
                      <input
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={isAssetListOpen}
                        aria-controls={assetListId}
                        aria-activedescendant={activeAssetId}
                        value={assetQuery}
                        onChange={(event) => handleAssetQueryChange(event.target.value)}
                        onBlur={() => {
                          window.setTimeout(() => setIsAssetListOpen(false), 120);
                        }}
                        onKeyDown={handleAssetSearchKeyDown}
                        placeholder="ASML, US5949181045..."
                        className={inputClassName("pr-11")}
                      />
                      <button
                        type="button"
                        aria-label="Search ticker"
                        title="Search ticker"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => void runAssetSearch()}
                        disabled={assetSearchState === "loading" || assetQuery.trim().length < 2}
                        className="absolute right-1 top-1 flex h-7 w-8 items-center justify-center rounded border border-white/10 bg-surface text-slate-300 hover:border-neutral/50 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {assetSearchState === "loading" ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <Search size={14} />
                        )}
                      </button>
                      {assetSearchState === "loading" ? (
                        <span className="sr-only">Searching saved assets and Yahoo Finance</span>
                      ) : null}
                      {isAssetListOpen && assetQuery.trim().length >= 2 ? (
                        <div
                          id={assetListId}
                          role="listbox"
                          aria-label="Ticker search results"
                          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-white/10 bg-background shadow-panel"
                        >
                          {assetResults.map((asset, index) => (
                            <button
                              id={`${assetListId}-${index}`}
                              key={`${asset.source}-${asset.broker}-${asset.symbol}`}
                              type="button"
                              role="option"
                              aria-selected={index === activeAssetIndex}
                              onMouseEnter={() => setActiveAssetIndex(index)}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                chooseAsset(asset);
                              }}
                              onClick={() => chooseAsset(asset)}
                              className={cn(
                                "flex w-full items-center justify-between gap-3 border-b border-white/5 px-3 py-2 text-left text-xs hover:bg-surface",
                                index === activeAssetIndex && "bg-surface",
                              )}
                            >
                              <span className="min-w-0 space-y-0.5">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="font-semibold text-slate-100">{asset.symbol}</span>
                                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] uppercase text-slate-500">
                                    {asset.source === "database" ? "Saved" : asset.source === "nfin" ? "Nasdaq" : "Yahoo"}
                                  </span>
                                  <span className="truncate text-slate-500">{asset.name ?? asset.providerSymbol}</span>
                                </span>
                                <span className="block truncate text-[10px] text-slate-600">
                                  {asset.broker} · {asset.assetType} · {asset.currency}
                                  {asset.isin ? ` · ${asset.isin}` : ""}
                                </span>
                              </span>
                              <span className="shrink-0 text-right font-mono text-slate-300">
                                {asset.latestPrice
                                  ? formatCurrencyAmount(asset.latestPrice, asset.latestPriceCurrency)
                                  : asset.currency}
                              </span>
                            </button>
                          ))}
                          {assetSearchState === "loading" ? (
                            <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500">
                              <Loader2 size={14} className="animate-spin" />
                              Searching saved assets and Yahoo Finance
                            </div>
                          ) : null}
                          {assetSearchState === "empty" ? (
                            <div className="px-3 py-3 text-xs text-slate-500">
                              No ticker found for <span className="font-mono text-slate-400">{assetQuery.trim()}</span>.
                              Try symbol, ISIN, or company name.
                            </div>
                          ) : null}
                          {assetSearchState === "error" ? (
                            <div className="px-3 py-3 text-xs text-red-200">
                              Search failed. Try again in a moment.
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </Field>
                  {selectedAsset ? (
                    <div className="flex items-center justify-between gap-3 rounded-md border border-neutral/30 bg-neutral/10 px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-blue-100">
                          {selectedAsset.symbol} · {selectedAsset.currency}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {selectedAsset.name ?? selectedAsset.providerSymbol} · {selectedAsset.broker}
                        </p>
                      </div>
                      <span className="shrink-0 rounded bg-background/80 px-2 py-1 text-[10px] uppercase text-slate-400">
                        {selectedAsset.source === "database" ? "Saved asset" : "Online result"}
                      </span>
                    </div>
                  ) : null}
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
                <>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <Field label="Quantity">
                      <input value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClassName()} />
                    </Field>
                    <Field label={`Price ${activeCurrency}`}>
                      <input
                        value={price}
                        onChange={(event) => setPrice(event.target.value)}
                        placeholder={priceStatus === "loading" ? "Loading price..." : ""}
                        className={inputClassName()}
                      />
                    </Field>
                    <Field label={`Gross ${activeCurrency}`}>
                      <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={grossAmount ? String(grossAmount) : ""} className={inputClassName()} />
                    </Field>
                  </div>
                  {selectedPriceAsset ? (
                    <div className="mt-2 text-[10px] text-slate-500">
                      {priceStatus === "ready" && priceSource ? (
                        <span>
                          Price from {priceSource}
                          {priceDate ? ` on ${priceDate}` : ""}; gross default includes fee and tax.
                        </span>
                      ) : priceStatus === "loading" ? (
                        <span>Loading {tradeDate === todayKey() ? "current" : "historical"} price.</span>
                      ) : priceStatus === "error" ? (
                        <span className="text-red-200">Price unavailable. Enter price manually.</span>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}

              <div
                className={cn(
                  "mt-4 grid gap-3",
                  needsFxConversion ? "md:grid-cols-[minmax(0,1fr)_160px_110px]" : "md:grid-cols-2",
                )}
              >
                <Field label={type === "FX_CONVERSION" ? "From cash account" : "Cash account"}>
                  <select value={cashAccountId} onChange={(event) => handleCashAccountChange(event.target.value)} className={inputClassName()}>
                    <option value="">New / manual account</option>
                    {(context?.cashAccounts ?? []).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.broker} · {account.currency} · {formatCurrencyAmount(account.balance, account.currency)}
                      </option>
                    ))}
                  </select>
                </Field>

                {needsFxConversion ? (
                  <>
                    <Field label={`Value ${selectedCashCurrency}`}>
                      <input
                        value={cashAccountValue}
                        onChange={(event) => setCashAccountValue(event.target.value)}
                        placeholder={fxRateState === "loading" ? "Loading FX..." : ""}
                        className={inputClassName()}
                      />
                    </Field>
                    <Field label="FX fee %">
                      <input
                        value={fxFeePercent}
                        onChange={(event) => setFxFeePercent(event.target.value)}
                        className={inputClassName()}
                      />
                    </Field>
                  </>
                ) : null}

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

              {needsFxConversion ? (
                <div className="mt-2 text-[10px] text-slate-500">
                  {fxRateState === "ready" && fxRate ? (
                    <span>
                      FX {activeCurrency}/{selectedCashCurrency} {formatNumber(fxRate, defaultNumberFormatPreferences)}
                      {fxRateDate ? ` from ${fxRateDate}` : ""}, fee applied in the cash-account value.
                    </span>
                  ) : fxRateState === "loading" ? (
                    <span>Loading FX rate for {activeCurrency}/{selectedCashCurrency}.</span>
                  ) : fxRateState === "error" ? (
                    <span className="text-red-200">FX rate unavailable. Enter the cash-account value manually.</span>
                  ) : null}
                </div>
              ) : null}

              {!cashAccountId ? (
                <div className="mt-3">
                  <Field label="Broker">
                    <input value={manualBroker} onChange={(event) => setManualBroker(event.target.value)} className={inputClassName()} />
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
                disabled={cannotSave}
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
