import { Bell, LogOut, Search, UserCircle2 } from "lucide-react";
import { redirect } from "next/navigation";
import { DividendsWindowButton } from "@/components/dividends-window-button";
import { DashboardWorkspace } from "@/components/dashboard-workspace";
import { ModeSwitcher } from "@/components/mode-switcher";
import { RecalculatePortfolioButton } from "@/components/recalculate-portfolio-button";
import { TransactionButton } from "@/components/transaction-button";
import { getCurrentPfpUser } from "@/lib/auth/current-user";
import { navItems } from "@/lib/demo-data";
import {
  defaultNumberFormatPreferences,
  formatPercent,
} from "@/lib/format";
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
  const { holdings, metrics } = dashboard;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-3 pb-24 pt-3 sm:px-5 lg:px-6 lg:pb-8">
      <header className="sticky top-0 z-20 -mx-3 border-b border-white/5 bg-background/90 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
        <div className="flex items-center gap-2">
          <ModeSwitcher />
          <button
            type="button"
            aria-label="Search"
            title="Search"
            className="hidden h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-panel text-slate-300 hover:border-neutral/50 hover:text-slate-50 sm:flex"
          >
            <Search size={17} />
          </button>
          <button
            type="button"
            aria-label="Notifications"
            title="Notifications"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-panel text-slate-300 hover:border-neutral/50 hover:text-slate-50"
          >
            <Bell size={17} />
          </button>
          <div
            className="hidden h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-panel text-slate-300 md:flex"
            title={`${auth.user.email} · ${auth.user.isLocalBypass ? "Local bypass" : "Google login"}`}
            aria-label={`${auth.user.email} user session`}
          >
            <UserCircle2 size={17} />
          </div>
          <a
            href="/auth/logout"
            aria-label="Sign out"
            title="Sign out"
            className="hidden h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-panel text-slate-300 hover:border-neutral/50 hover:text-slate-50 md:flex"
          >
            <LogOut size={16} />
          </a>
          <RecalculatePortfolioButton />
          <RecalculatePortfolioButton mode="incremental" label="Update" />
          <TransactionButton portfolioCurrency={dashboard.baseCurrency} />
        </div>
      </header>

      <section className="grid gap-3 py-3 sm:grid-cols-3">
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
              {metric.label === "Dividends YTD" ? (
                <DividendsWindowButton holdings={holdings} portfolioCurrency={dashboard.baseCurrency} />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-slate-300">
                  <metric.icon size={16} />
                </div>
              )}
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

      <DashboardWorkspace
        source={dashboard.source}
        portfolioName={dashboard.portfolioName}
        baseCurrency={dashboard.baseCurrency}
        costBasisMethod={dashboard.costBasisMethod}
        portfolioSeries={dashboard.portfolioSeries}
        filteredPortfolioSeries={dashboard.filteredPortfolioSeries}
        holdings={dashboard.holdings}
        transactions={dashboard.transactions}
      />

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
