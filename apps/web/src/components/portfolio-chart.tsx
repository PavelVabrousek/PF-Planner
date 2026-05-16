"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { defaultNumberFormatPreferences, formatCurrencyAmount, formatCurrencyNumber, formatPercent } from "@/lib/format";
import type { DashboardData } from "@/lib/portfolio-data";
import { cn } from "@/lib/utils";

type PortfolioRange = "1W" | "1M" | "YTD" | "1Y" | "5Y" | "10Y";

const portfolioRanges = [
  { id: "1W", label: "Week" },
  { id: "1M", label: "Month" },
  { id: "YTD", label: "YTD" },
  { id: "1Y", label: "Year" },
  { id: "5Y", label: "5Y" },
  { id: "10Y", label: "10Y" },
] satisfies Array<{ id: PortfolioRange; label: string }>;

function subtractRange(date: Date, range: PortfolioRange) {
  const nextDate = new Date(date);

  if (range === "1W") {
    nextDate.setUTCDate(nextDate.getUTCDate() - 7);
  }

  if (range === "1M") {
    nextDate.setUTCMonth(nextDate.getUTCMonth() - 1);
  }

  if (range === "1Y") {
    nextDate.setUTCFullYear(nextDate.getUTCFullYear() - 1);
  }

  if (range === "5Y") {
    nextDate.setUTCFullYear(nextDate.getUTCFullYear() - 5);
  }

  if (range === "10Y") {
    nextDate.setUTCFullYear(nextDate.getUTCFullYear() - 10);
  }

  return nextDate;
}

function rangeStartDate(data: DashboardData["portfolioSeries"], range: PortfolioRange) {
  const latestPoint = data.at(-1);

  if (!latestPoint) {
    return null;
  }

  const latestDate = new Date(`${latestPoint.date}T00:00:00Z`);

  if (range === "YTD") {
    return new Date(Date.UTC(latestDate.getUTCFullYear(), 0, 1));
  }

  return subtractRange(latestDate, range);
}

function chartTick(value: string, range: PortfolioRange) {
  const date = new Date(`${value}T00:00:00Z`);

  if (range === "1W" || range === "1M") {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }

  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function paddedDomainMin(value: number) {
  return value >= 0 ? value * 0.9 : value * 1.1;
}

function paddedDomainMax(value: number) {
  return value >= 0 ? value * 1.1 : value * 0.9;
}

function niceMajorStep(range: number, targetTickCount = 6) {
  if (!Number.isFinite(range) || range <= 0) {
    return 100_000;
  }

  const rawStep = range / Math.max(1, targetTickCount - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalizedStep = rawStep / magnitude;
  const niceMultiplier =
    normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 2.5 ? 2.5 : normalizedStep <= 5 ? 5 : 10;

  return niceMultiplier * magnitude;
}

function buildMajorCurrencyAxis(values: number[]) {
  const validValues = values.filter((value) => Number.isFinite(value));

  if (validValues.length === 0) {
    return {
      domain: [0, 100_000] as [number, number],
      ticks: [0, 100_000],
    };
  }

  const minimum = Math.min(...validValues);
  const maximum = Math.max(...validValues);
  const paddedMinimum = paddedDomainMin(minimum);
  const paddedMaximum = paddedDomainMax(maximum);
  const step = niceMajorStep(paddedMaximum - paddedMinimum);
  const axisMinimum = Math.floor(paddedMinimum / step) * step;
  const axisMaximum = Math.ceil(paddedMaximum / step) * step;
  const ticks: number[] = [];

  for (let value = axisMinimum; value <= axisMaximum + step * 0.001; value += step) {
    ticks.push(Math.round(value));
  }

  return {
    domain: [axisMinimum, axisMaximum] as [number, number],
    ticks,
  };
}

export function PortfolioChart({
  data,
  currency,
  eyebrow,
  title,
}: {
  data: DashboardData["portfolioSeries"];
  currency: string;
  eyebrow: string;
  title: string;
}) {
  const [range, setRange] = useState<PortfolioRange>("1Y");
  const filteredData = useMemo(() => {
    const startDate = rangeStartDate(data, range);

    if (!startDate) {
      return data;
    }

    const startKey = startDate.toISOString().slice(0, 10);

    return data.filter((point) => point.date >= startKey);
  }, [data, range]);
  const yAxis = useMemo(
    () => buildMajorCurrencyAxis(filteredData.map((point) => point.value)),
    [filteredData],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-slate-400">{eyebrow}</p>
          <h2 className="truncate text-sm font-semibold text-slate-50">{title}</h2>
        </div>
        <fieldset className="grid w-full grid-cols-6 gap-1 rounded-md border border-white/10 bg-background/60 p-1 sm:max-w-xl">
          <legend className="sr-only">Portfolio chart date range</legend>
          {portfolioRanges.map((item) => (
            <label
              key={item.id}
              className={cn(
                "flex h-7 cursor-pointer items-center justify-center gap-1 rounded px-1 text-[10px] font-medium",
                range === item.id ? "bg-neutral/20 text-blue-200" : "text-slate-500 hover:text-slate-200",
              )}
            >
              <input
                type="radio"
                name="portfolio-range"
                value={item.id}
                checked={range === item.id}
                onChange={() => setRange(item.id)}
                className="h-3 w-3 border-white/20 bg-panel text-neutral focus:ring-neutral/40"
              />
              {item.label}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="h-64 min-h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={filteredData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioValue" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.55} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#94A3B8", fontSize: 11 }}
              minTickGap={14}
              tickFormatter={(value: string) => chartTick(value, range)}
            />
            <YAxis
              width={112}
              domain={yAxis.domain}
              ticks={yAxis.ticks}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#94A3B8", fontSize: 9 }}
              tickFormatter={(value: number) => formatCurrencyAmount(value, currency)}
            />
            <Tooltip
              cursor={{ stroke: "rgba(59,130,246,0.35)" }}
              contentStyle={{
                background: "#151922",
                border: "1px solid rgba(148,163,184,0.18)",
                borderRadius: 8,
                color: "#E5E7EB",
                fontSize: 12,
              }}
              formatter={(value: number) => [formatCurrencyAmount(value, currency), "Value"]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#portfolioValue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type AllocationMode = "type" | "currency" | "broker";

type AllocationRow = {
  name: string;
  amount: number;
  value: number;
  fill: string;
};

const allocationModes = [
  { id: "type", label: "Type" },
  { id: "currency", label: "Currency" },
  { id: "broker", label: "Broker" },
] satisfies Array<{ id: AllocationMode; label: string }>;

const allocationColors = [
  "#22C55E",
  "#3B82F6",
  "#F59E0B",
  "#A855F7",
  "#14B8A6",
  "#EF4444",
  "#EAB308",
  "#38BDF8",
];

function allocationKey(holding: DashboardData["holdings"][number], mode: AllocationMode) {
  if (mode === "type") {
    return holding.type;
  }

  if (mode === "currency") {
    return holding.currency;
  }

  return holding.broker;
}

function buildAllocationRows(holdings: DashboardData["holdings"], mode: AllocationMode): AllocationRow[] {
  const totalValue = holdings.reduce((sum, holding) => sum + holding.valueCzk, 0);
  const grouped = holdings.reduce<Record<string, number>>((accumulator, holding) => {
    const key = allocationKey(holding, mode);
    accumulator[key] = (accumulator[key] ?? 0) + holding.valueCzk;
    return accumulator;
  }, {});

  return Object.entries(grouped)
    .map(([name, value], index) => ({
      name,
      amount: value,
      value: totalValue > 0 ? (value / totalValue) * 100 : 0,
      fill: allocationColors[index % allocationColors.length],
    }))
    .sort((left, right) => right.value - left.value);
}

export function AllocationChart({
  holdings,
  portfolioCurrency,
}: {
  holdings: DashboardData["holdings"];
  portfolioCurrency: string;
}) {
  const [mode, setMode] = useState<AllocationMode>("type");
  const data = useMemo(() => buildAllocationRows(holdings, mode), [holdings, mode]);

  return (
    <div className="space-y-3">
      <fieldset className="grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-background/60 p-1">
        <legend className="sr-only">Allocation grouping</legend>
        {allocationModes.map((item) => (
          <label
            key={item.id}
            className={cn(
              "flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded px-2 text-[10px] font-medium",
              mode === item.id ? "bg-neutral/20 text-blue-200" : "text-slate-500 hover:text-slate-200",
            )}
          >
            <input
              type="radio"
              name="allocation-mode"
              value={item.id}
              checked={mode === item.id}
              onChange={() => setMode(item.id)}
              className="h-3 w-3 border-white/20 bg-panel text-neutral focus:ring-neutral/40"
            />
            {item.label}
          </label>
        ))}
      </fieldset>

      <div className="grid grid-cols-[108px_1fr] items-center gap-4">
        <div className="h-28 w-28">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={34}
                outerRadius={52}
                paddingAngle={3}
                stroke="none"
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#151922",
                  border: "1px solid rgba(148,163,184,0.18)",
                  borderRadius: 8,
                  color: "#E5E7EB",
                  fontSize: 12,
                }}
                formatter={(value: number) => [
                  formatPercent(value, defaultNumberFormatPreferences, { sign: "never" }),
                  portfolioCurrency,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2">
          {data.map((item) => (
            <div
              key={item.name}
              className="grid grid-cols-[minmax(0,1fr)_64px_92px] items-center gap-2 text-xs"
            >
              <span className="flex min-w-0 items-center gap-2 text-slate-300">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.fill }} />
                <span className="truncate">{item.name}</span>
              </span>
              <span className="text-right font-mono tabular text-slate-100">
                {formatPercent(item.value, defaultNumberFormatPreferences, { sign: "never" })}
              </span>
              <span className="text-right font-mono text-[10px] tabular text-slate-500">
                {formatCurrencyNumber(item.amount)} {portfolioCurrency}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
