import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  DatabaseZap,
  LogOut,
  Plus,
  Search,
} from "lucide-react";
import { redirect } from "next/navigation";
import { AllocationChart, PortfolioChart } from "@/components/portfolio-chart";
import { HoldingActions } from "@/components/holding-actions";
import { RecalculatePortfolioButton } from "@/components/recalculate-portfolio-button";
import { getCurrentPfpUser } from "@/lib/auth/current-user";
import { navItems } from "@/lib/demo-data";
import { defaultNumberFormatPreferences, formatCurrencyAmount, formatCurrencyNumber, formatPercent } from "@/lib/format";
import { getDashboardData } from "@/lib/portfolio-data";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function MetricTone({ tone }: { tone: string }) {
  return cn(
    "rounded-full px-2 py-0.5 text-[10px] font-medium",
    tone === "positive" && "bg-positive/10 text-positive",
    tone === "negative" && "bg-negative/10 text-negative",
    tone === "warning" && "bg-warning/10 text-warning",
    tone === "neutral" && "bg-neutral/10 text-blue-300",
  );
}

function performanceTone(value: number) {
  if (value > 0) {
    return "bg-positive/10 text-positive";
  }

  if (value < 0) {
    return "bg-negative/10 text-negative";
  }

  return "bg-slate-500/10 text-slate-400";
}

function formatPerformance(value: number, label: string) {
  return formatPercent(value, defaultNumberFormatPreferences, { sign: "always", suffix: label });
}

export default async function DashboardPage() {
  const auth = await getCurrentPfpUser();

  if (auth.status !== "authenticated") {
    if (auth.status === "forbidden") {
      redirect("/login?error=forbidden");
    }

    redirect(`/login?next=/&error=${auth.status === "misconfigured" ? "misconfigured" : ""}`);
  }

  const dashboard = await getDashboardData(auth.user);
  const { holdings, metrics, portfolioSeries, transactions, watchlist, workQueue } = dashboard;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-3 pb-24 pt-3 sm:px-5 lg:px-6 lg:pb-8">
      <header className="sticky top-0 z-20 -mx-3 border-b border-white/5 bg-background/90 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral/15 text-blue-300 ring-1 ring-neutral/30">
            <DatabaseZap size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">PF Planner</p>
            <h1 className="truncate text-base font-semibold text-slate-50 sm:text-lg">
              Portfolio Command Center
            </h1>
          </div>
          <button
            type="button"
            aria-label="Search"
            className="hidden h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-panel text-slate-300 hover:border-neutral/50 hover:text-slate-50 sm:flex"
          >
            <Search size={17} />
          </button>
          <button
            type="button"
            aria-label="Notifications"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-panel text-slate-300 hover:border-neutral/50 hover:text-slate-50"
          >
            <Bell size={17} />
          </button>
          <div className="hidden min-w-0 text-right md:block">
            <p className="max-w-40 truncate text-[11px] text-slate-500">{auth.user.email}</p>
            <p className="text-[10px] text-slate-600">{auth.user.isLocalBypass ? "Local bypass" : "Google login"}</p>
          </div>
          <a
            href="/auth/logout"
            aria-label="Sign out"
            className="hidden h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-panel text-slate-300 hover:border-neutral/50 hover:text-slate-50 md:flex"
          >
            <LogOut size={16} />
          </a>
          <RecalculatePortfolioButton />
          <RecalculatePortfolioButton mode="incremental" label="Update" />
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-md bg-neutral px-3 text-xs font-medium text-white hover:bg-blue-500"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Transaction</span>
          </button>
        </div>
      </header>

      <section className="grid gap-3 py-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => (
          <article
            key={metric.label}
            className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-400">{metric.label}</p>
                <p className="mt-1 font-mono text-lg font-semibold tabular text-slate-50 sm:text-xl">
                  {metric.value}
                </p>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-slate-300">
                <metric.icon size={16} />
              </div>
            </div>
            {index === 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {dashboard.netWorthPerformance.map((period) => (
                  <span
                    key={period.label}
                    className={cn(
                      "rounded-full px-2 py-0.5 font-mono text-[10px] font-medium tabular",
                      performanceTone(period.value),
                    )}
                  >
                    {formatPerformance(period.value, period.label)}
                  </span>
                ))}
              </div>
            ) : (
              <span className={MetricTone({ tone: metric.tone })}>{metric.delta}</span>
            )}
          </article>
        ))}
      </section>

      <section className="grid flex-1 gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <div className="space-y-3">
          <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
            <PortfolioChart
              data={portfolioSeries}
              currency={dashboard.baseCurrency}
              eyebrow={dashboard.source === "supabase" ? "Live portfolio" : "Demo portfolio"}
              title={dashboard.portfolioName}
            />
          </article>

          <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-50">Holdings</h2>
              <span className="text-xs text-slate-500">
                {dashboard.costBasisMethod} MVP view · {dashboard.baseCurrency}
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
                      Value {dashboard.baseCurrency}
                    </th>
                    <th className="border-b border-white/10 pb-2 text-right font-medium">Alloc.</th>
                    <th className="border-b border-white/10 pb-2 text-right font-medium">Day</th>
                    <th className="border-b border-white/10 pb-2 text-right font-medium">Return</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding) => (
                    <tr key={holding.symbol} className="text-slate-200">
                      <td className="border-b border-white/5 py-0.5">
                        <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                          <HoldingActions holding={holding} portfolioCurrency={dashboard.baseCurrency} />
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span className="shrink-0 font-semibold">{holding.symbol}</span>
                            <span className="min-w-0 truncate text-[11px] text-slate-500">
                              {holding.name} · {holding.exchange}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-white/5 py-0.5 text-slate-400">
                        {holding.type}
                      </td>
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
        </div>

        <aside className="space-y-3">
          <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-50">Allocation</h2>
              <span className="rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-medium text-positive">
                Balanced
              </span>
            </div>
            <AllocationChart holdings={holdings} portfolioCurrency={dashboard.baseCurrency} />
          </article>

          <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-50">Watchlist</h2>
              <AlertTriangle size={15} className="text-warning" />
            </div>
            <div className="space-y-2">
              {watchlist.map((item) => (
                <div
                  key={item.symbol}
                  className="flex items-center justify-between rounded-md bg-surface/70 px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-100">{item.symbol}</p>
                    <p className="font-mono text-xs tabular text-slate-400">{item.price}</p>
                  </div>
                  <span
                    className={cn(
                      "flex items-center gap-1 font-mono text-xs tabular",
                      item.change >= 0 ? "text-positive" : "text-negative",
                    )}
                  >
                    {item.change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {formatPercent(item.change, defaultNumberFormatPreferences, { sign: "never" })}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
            <h2 className="mb-3 text-sm font-semibold text-slate-50">Recent transactions</h2>
            <div className="space-y-2">
              {transactions.map((transaction) => (
                <div
                  key={`${transaction.type}-${transaction.symbol}-${transaction.date}`}
                  className="grid grid-cols-[64px_1fr_auto] items-center gap-2 text-xs"
                >
                  <span className="rounded bg-surface px-2 py-1 text-center font-mono text-[10px] text-slate-300">
                    {transaction.type}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-200">{transaction.symbol}</p>
                    <p className="font-mono text-[11px] tabular text-slate-500">
                      {transaction.date}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "font-mono tabular",
                      transaction.amount >= 0 ? "text-positive" : "text-slate-200",
                    )}
                  >
                    {formatCurrencyAmount(transaction.amount, transaction.currency)}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
            <h2 className="mb-3 text-sm font-semibold text-slate-50">MVP work queue</h2>
            <div className="space-y-2">
              {workQueue.map((item) => (
                <div key={item.label} className="flex gap-3 rounded-md bg-surface/70 p-2.5">
                  <item.icon size={16} className="mt-0.5 shrink-0 text-blue-300" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-200">{item.label}</p>
                    <p className="truncate text-[11px] text-slate-500">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </aside>
      </section>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-panel/95 px-2 py-2 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-6 gap-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={cn(
                "flex h-12 flex-col items-center justify-center gap-1 rounded-md text-[10px]",
                item.active ? "bg-neutral/15 text-blue-300" : "text-slate-500",
              )}
            >
              <item.icon size={16} />
              <span className="leading-none">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
