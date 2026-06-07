import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  Landmark,
  PiggyBank,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import type { BankingAccount, BankingData, BankingTimelineEvent } from "@/lib/banking-data";
import { formatCurrencyAmount, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

function metricTone(value: number) {
  if (value > 0) {
    return "text-positive";
  }

  if (value < 0) {
    return "text-negative";
  }

  return "text-slate-400";
}

function cardTone(tone: "blue" | "green" | "red" | "amber" | "teal") {
  return cn(
    tone === "blue" && "bg-neutral/10 text-blue-300",
    tone === "green" && "bg-positive/10 text-positive",
    tone === "red" && "bg-negative/10 text-negative",
    tone === "amber" && "bg-warning/10 text-warning",
    tone === "teal" && "bg-teal-500/10 text-teal-300",
  );
}

function accountTypeLabel(type: string) {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function eventTone(event: BankingTimelineEvent) {
  return cn(
    event.tone === "negative" && "border-negative/40 bg-negative/10 text-red-200",
    event.tone === "positive" && "border-positive/40 bg-positive/10 text-green-200",
    event.tone === "warning" && "border-warning/40 bg-warning/10 text-amber-200",
    event.tone === "neutral" && "border-neutral/40 bg-neutral/10 text-blue-200",
  );
}

function AccountRow({ account }: { account: BankingAccount }) {
  const isLiability = account.direction === "LIABILITY";
  const isReceivable = account.direction === "RECEIVABLE";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/5 px-3 py-2 last:border-b-0">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              isLiability ? "bg-negative" : isReceivable ? "bg-teal-400" : "bg-positive",
            )}
          />
          <p className="truncate text-xs font-semibold text-slate-100">{account.name}</p>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {account.partnerName} · {accountTypeLabel(account.accountType)}
          {account.ratePercent ? ` · ${formatPercent(account.ratePercent, undefined, { sign: "never" })} p.a.` : ""}
        </p>
      </div>
      <div className="text-right">
        <p
          className={cn(
            "font-mono text-xs font-semibold tabular",
            isLiability ? "text-negative" : isReceivable ? "text-teal-300" : "text-slate-100",
          )}
        >
          {isLiability ? "-" : ""}
          {formatCurrencyAmount(account.balance, account.currency)}
        </p>
        {account.monthlyPayment ? (
          <p className="mt-0.5 text-[10px] text-slate-500">
            {formatCurrencyAmount(account.monthlyPayment, account.currency)} / month
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TimelineEvent({ event }: { event: BankingTimelineEvent }) {
  return (
    <div className="min-w-[160px] flex-1 rounded-md border border-white/10 bg-background/70 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-slate-500">{event.date.slice(5)}</span>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", eventTone(event))}>
          {event.tone === "negative" ? "Due" : "Review"}
        </span>
      </div>
      <p className="truncate text-xs font-semibold text-slate-100">{event.label}</p>
      <p className={cn("mt-1 font-mono text-xs tabular", event.tone === "negative" ? "text-negative" : "text-positive")}>
        {event.tone === "negative" ? "-" : "+"}
        {formatCurrencyAmount(event.amount, event.currency)}
      </p>
    </div>
  );
}

export function BankingWorkspace({ data }: { data: BankingData }) {
  const runway =
    data.metrics.runwayMonths === null ? "-" : `${formatNumber(data.metrics.runwayMonths, undefined, 1)} months`;

  return (
    <section className="grid gap-3 py-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">Monthly committed</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular text-slate-50">
                {formatCurrencyAmount(data.metrics.monthlyCommitted, data.baseCurrency)}
              </p>
            </div>
            <span className={cn("rounded-md p-2", cardTone("amber"))}>
              <CalendarDays size={16} />
            </span>
          </div>
          <p className="mt-2 w-fit rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
            debt payments and scheduled obligations
          </p>
        </article>

        <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">Available liquidity</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular text-slate-50">
                {formatCurrencyAmount(data.metrics.liquidAssets, data.baseCurrency)}
              </p>
            </div>
            <span className={cn("rounded-md p-2", cardTone("green"))}>
              <WalletCards size={16} />
            </span>
          </div>
          <p className="mt-2 w-fit rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-medium text-positive">
            current + savings accounts
          </p>
        </article>

        <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">Interest income</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular text-slate-50">
                {formatCurrencyAmount(data.metrics.monthlyInterestIncome, data.baseCurrency)}
              </p>
            </div>
            <span className={cn("rounded-md p-2", cardTone("teal"))}>
              <PiggyBank size={16} />
            </span>
          </div>
          <p className="mt-2 w-fit rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium text-teal-300">
            estimated monthly gross
          </p>
        </article>

        <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">Runway</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular text-slate-50">{runway}</p>
            </div>
            <span className={cn("rounded-md p-2", cardTone("blue"))}>
              <ShieldCheck size={16} />
            </span>
          </div>
          <p className="mt-2 w-fit rounded-full bg-neutral/10 px-2 py-0.5 text-[10px] font-medium text-blue-300">
            liquidity / committed
          </p>
        </article>
      </div>

      <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Cash calendar</p>
            <h2 className="text-sm font-semibold text-slate-50">Upcoming banking events</h2>
          </div>
          <span className="rounded-full bg-surface px-2 py-1 text-[10px] text-slate-400">manual reminders</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {data.timeline.length > 0 ? (
            data.timeline.map((event) => <TimelineEvent key={event.id} event={event} />)
          ) : (
            <div className="rounded-md border border-white/10 bg-background/70 px-3 py-6 text-xs text-slate-500">
              No scheduled banking events yet.
            </div>
          )}
        </div>
      </article>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
        <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Debt commitments</p>
              <h2 className="text-sm font-semibold text-slate-50">Loans, mortgages, cards</h2>
            </div>
            <CreditCard size={16} className="text-red-300" />
          </div>
          <div className="overflow-hidden rounded-md border border-white/10">
            {data.debtAccounts.length > 0 ? (
              data.debtAccounts.map((account) => <AccountRow key={account.id} account={account} />)
            ) : (
              <div className="px-3 py-6 text-xs text-slate-500">No liabilities entered.</div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-md bg-background/70 p-2">
              <p className="text-[10px] text-slate-500">Liabilities</p>
              <p className="mt-1 font-mono text-sm font-semibold text-negative">
                -{formatCurrencyAmount(data.metrics.liabilities, data.baseCurrency)}
              </p>
            </div>
            <div className="rounded-md bg-background/70 p-2">
              <p className="text-[10px] text-slate-500">Net banking position</p>
              <p className={cn("mt-1 font-mono text-sm font-semibold", metricTone(data.metrics.netPosition))}>
                {formatCurrencyAmount(data.metrics.netPosition, data.baseCurrency)}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Savings and rates</p>
              <h2 className="text-sm font-semibold text-slate-50">Yield ladder</h2>
            </div>
            <PiggyBank size={16} className="text-green-300" />
          </div>
          <div className="overflow-hidden rounded-md border border-white/10">
            {data.savingsAccounts.length > 0 ? (
              data.savingsAccounts.map((account) => <AccountRow key={account.id} account={account} />)
            ) : (
              <div className="px-3 py-6 text-xs text-slate-500">No savings accounts entered.</div>
            )}
          </div>
          <div className="mt-3 rounded-md bg-background/70 p-2">
            <p className="text-[10px] text-slate-500">Receivables</p>
            <p className="mt-1 font-mono text-sm font-semibold text-teal-300">
              {formatCurrencyAmount(data.metrics.receivables, data.baseCurrency)}
            </p>
          </div>
        </article>
      </div>

      <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Accounts ledger</p>
            <h2 className="text-sm font-semibold text-slate-50">Manual account balances</h2>
          </div>
          <Landmark size={16} className="text-blue-300" />
        </div>
        <div className="overflow-auto rounded-md border border-white/10">
          <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
            <thead className="bg-background text-slate-400">
              <tr>
                <th className="border-b border-r border-white/10 px-3 py-2 font-medium">Account</th>
                <th className="border-b border-r border-white/10 px-3 py-2 font-medium">Partner</th>
                <th className="border-b border-r border-white/10 px-3 py-2 font-medium">Type</th>
                <th className="border-b border-r border-white/10 px-3 py-2 text-right font-medium">Balance</th>
                <th className="border-b border-white/10 px-3 py-2 text-right font-medium">Signal</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((account) => {
                const isLiability = account.direction === "LIABILITY";

                return (
                  <tr key={account.id} className="odd:bg-surface/30">
                    <td className="border-b border-r border-white/5 px-3 py-2 font-semibold text-slate-100">
                      {account.name}
                    </td>
                    <td className="border-b border-r border-white/5 px-3 py-2 text-slate-400">{account.partnerName}</td>
                    <td className="border-b border-r border-white/5 px-3 py-2 text-slate-400">
                      {accountTypeLabel(account.accountType)}
                    </td>
                    <td
                      className={cn(
                        "border-b border-r border-white/5 px-3 py-2 text-right font-mono tabular",
                        isLiability ? "text-negative" : "text-slate-100",
                      )}
                    >
                      {isLiability ? "-" : ""}
                      {formatCurrencyAmount(account.balance, account.currency)}
                    </td>
                    <td className="border-b border-white/5 px-3 py-2 text-right">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          isLiability ? "bg-negative/10 text-negative" : "bg-positive/10 text-positive",
                        )}
                      >
                        {isLiability ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                        {account.direction.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
