"use client";

import { type PointerEvent, useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  LineChart,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  ScrollText,
  TrendingDown,
  X,
} from "lucide-react";
import {
  defaultNumberFormatPreferences,
  formatCurrencyAmount,
  formatCurrencyNumber,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import type { AssetChartEvent, BuyTransactionHistoryRow, DividendHistoryRow } from "@/lib/portfolio-data";
import { cn } from "@/lib/utils";

type HoldingAction = "chart" | "history" | "edit" | "sell" | "buy";
type ModalHoldingAction = Exclude<HoldingAction, "chart" | "history">;

type HoldingActionData = {
  assetId: string;
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  currency: string;
  valueCzk: number;
  allocation: number;
  dayChange: number;
  totalReturn: number;
  buyTransactions: BuyTransactionHistoryRow[];
  dividendHistory: DividendHistoryRow[];
  chartEvents: AssetChartEvent[];
};

type HoldingActionsProps = {
  holding: HoldingActionData;
  portfolioCurrency: string;
};

const actionItems = [
  { id: "chart", label: "Display chart", icon: LineChart },
  { id: "history", label: "Transaction history", icon: ScrollText },
  { id: "edit", label: "Edit Holdings", icon: Pencil },
  { id: "sell", label: "Sell", icon: TrendingDown },
  { id: "buy", label: "Buy", icon: Plus },
] satisfies Array<{ id: HoldingAction; label: string; icon: typeof LineChart }>;

let nextFloatingWindowZIndex = 70;

function initialWindowPosition(symbol: string) {
  const hash = Array.from(symbol).reduce((sum, character) => sum + character.charCodeAt(0), 0);

  return {
    x: 16 + (hash % 120),
    y: 96 + (hash % 80),
  };
}

function modalTitle(action: HoldingAction) {
  if (action === "chart") {
    return "Display chart";
  }

  if (action === "edit") {
    return "Edit Holdings";
  }

  if (action === "history") {
    return "Transaction history";
  }

  if (action === "sell") {
    return "Sell";
  }

  return "Buy";
}

function TransactionHistoryScaffold({
  holding,
  portfolioCurrency: fallbackPortfolioCurrency,
}: {
  holding: HoldingActionData;
  portfolioCurrency: string;
}) {
  const firstTransaction = holding.buyTransactions[0];
  const transactionCurrency = firstTransaction?.transactionCurrency ?? holding.currency;
  const actualCurrency = firstTransaction?.actualCurrency ?? holding.currency;
  const portfolioCurrency = firstTransaction?.portfolioCurrency ?? fallbackPortfolioCurrency;
  const totalDividendsPortfolio = holding.dividendHistory.reduce(
    (sum, row) => sum + (row.grossAmountPortfolio ?? 0),
    0,
  );
  const totalDividendImpact = holding.dividendHistory.reduce(
    (sum, row) => sum + (row.returnImpactPercent ?? 0),
    0,
  );

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-1">
        <div className="min-w-0 rounded-md bg-background px-2 py-1.5">
          <p className="truncate text-[9px] leading-3 text-slate-500">Asset</p>
          <p className="truncate font-mono text-[11px] leading-4 text-slate-100">{holding.symbol}</p>
        </div>
        <div className="min-w-0 rounded-md bg-background px-2 py-1.5">
          <p className="truncate text-[9px] leading-3 text-slate-500">Value</p>
          <p className="truncate font-mono text-[11px] leading-4 text-slate-100">
            {formatCurrencyAmount(holding.valueCzk, portfolioCurrency)}
          </p>
        </div>
        <div className="min-w-0 rounded-md bg-background px-2 py-1.5">
          <p className="truncate text-[9px] leading-3 text-slate-500">Allocation</p>
          <p className="truncate font-mono text-[11px] leading-4 text-slate-100">
            {formatPercent(holding.allocation, defaultNumberFormatPreferences, { sign: "never" })}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-white/10">
        <table className="w-full min-w-[570px] border-collapse text-left text-[9px] sm:text-[9.5px]">
          <thead className="bg-background text-slate-500">
            <tr>
              <th className="border-b border-white/5 px-1 py-1.5 font-medium" rowSpan={2}>
                Date
              </th>
              <th className="border-b border-white/5 px-1 py-1.5 text-center font-medium" colSpan={2}>
                Buy price
              </th>
              <th className="border-b border-white/5 px-1 py-1.5 text-right font-medium" rowSpan={2}>
                Qty
              </th>
              <th className="border-b border-white/5 px-1 py-1.5 text-center font-medium" colSpan={2}>
                Actual price
              </th>
              <th className="border-b border-white/5 px-1 py-1.5 text-center font-medium" colSpan={2}>
                Change
              </th>
              <th className="border-b border-white/5 px-1 py-1.5 text-right font-medium">
                Actual value
              </th>
            </tr>
            <tr>
              <th className="px-1 py-1 text-right font-medium text-slate-600">{transactionCurrency}</th>
              <th className="px-1 py-1 text-right font-medium text-slate-600">{portfolioCurrency}</th>
              <th className="px-1 py-1 text-right font-medium text-slate-600">{actualCurrency}</th>
              <th className="px-1 py-1 text-right font-medium text-slate-600">{portfolioCurrency}</th>
              <th className="px-1 py-1 text-right font-medium text-slate-600">{transactionCurrency}</th>
              <th className="px-1 py-1 text-right font-medium text-slate-600">{portfolioCurrency}</th>
              <th className="px-1 py-1 text-right font-medium text-slate-600">{portfolioCurrency}</th>
            </tr>
          </thead>
          <tbody>
            {holding.buyTransactions.length > 0 ? (
              holding.buyTransactions.map((row) => (
                <tr key={row.id} className="border-t border-white/5">
                  <td className="whitespace-nowrap px-1 py-1.5 font-mono text-slate-300">{row.date}</td>
                  <td className="px-1 py-1.5 text-right font-mono tabular text-slate-100">
                    {formatCurrencyNumber(row.buyingPrice)}
                  </td>
                  <td className="px-1 py-1.5 text-right font-mono tabular text-slate-100">
                    {formatCurrencyNumber(row.buyingPricePortfolio)}
                  </td>
                  <td className="px-1 py-1.5 text-right font-mono tabular text-slate-300">
                    {formatNumber(row.quantity)}
                  </td>
                  <td className="px-1 py-1.5 text-right font-mono tabular text-slate-100">
                    {formatCurrencyNumber(row.actualPrice)}
                  </td>
                  <td className="px-1 py-1.5 text-right font-mono tabular text-slate-100">
                    {formatCurrencyNumber(row.actualPricePortfolio)}
                  </td>
                  <td
                    className={cn(
                      "px-1 py-1.5 text-right font-mono tabular",
                      (row.changePercent ?? 0) >= 0 ? "text-positive" : "text-negative",
                    )}
                  >
                    {formatPercent(row.changePercent, defaultNumberFormatPreferences, { sign: "always" })}
                  </td>
                  <td
                    className={cn(
                      "px-1 py-1.5 text-right font-mono tabular",
                      (row.changePortfolioPercent ?? 0) >= 0 ? "text-positive" : "text-negative",
                    )}
                  >
                    {formatPercent(row.changePortfolioPercent, defaultNumberFormatPreferences, { sign: "always" })}
                  </td>
                  <td className="px-1 py-1.5 text-right font-mono tabular text-slate-50">
                    {formatCurrencyNumber(row.actualValuePortfolio)}
                  </td>
                </tr>
              ))
            ) : (
              <tr className="border-t border-white/5">
                <td className="px-3 py-6 text-center text-xs text-slate-500" colSpan={9}>
                  No BUY transactions found for this asset.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-white/10 bg-background/40 p-2">
        <div className="grid grid-cols-3 gap-1">
          <div className="min-w-0 rounded-md bg-background px-2 py-1.5">
            <p className="truncate text-[9px] leading-3 text-slate-500">Dividends</p>
            <p className="truncate font-mono text-[11px] leading-4 text-slate-100">
              {formatCurrencyAmount(totalDividendsPortfolio, portfolioCurrency)}
            </p>
          </div>
          <div className="min-w-0 rounded-md bg-background px-2 py-1.5">
            <p className="truncate text-[9px] leading-3 text-slate-500">Dividend rows</p>
            <p className="truncate font-mono text-[11px] leading-4 text-slate-100">
              {formatNumber(holding.dividendHistory.length)}
            </p>
          </div>
          <div className="min-w-0 rounded-md bg-background px-2 py-1.5">
            <p className="truncate text-[9px] leading-3 text-slate-500">Return uplift</p>
            <p
              className={cn(
                "truncate font-mono text-[11px] leading-4",
                totalDividendImpact >= 0 ? "text-positive" : "text-negative",
              )}
            >
              {formatPercent(totalDividendImpact, defaultNumberFormatPreferences, { sign: "always" })}
            </p>
          </div>
        </div>

        {holding.dividendHistory.length > 0 ? (
          <div className="mt-2 overflow-x-auto rounded-md border border-white/10">
            <table className="w-full min-w-[560px] border-collapse text-left text-[9px] sm:text-[10px]">
              <thead className="text-slate-500">
                <tr>
                  <th className="border-b border-white/5 px-1.5 py-1.5 font-medium">Dividend date</th>
                  <th className="border-b border-white/5 px-1.5 py-1.5 text-right font-medium">Qty held</th>
                  <th className="border-b border-white/5 px-1.5 py-1.5 text-right font-medium">Per share</th>
                  <th className="border-b border-white/5 px-1.5 py-1.5 text-right font-medium">Collected</th>
                  <th className="border-b border-white/5 px-1.5 py-1.5 text-right font-medium">
                    Value {portfolioCurrency}
                  </th>
                  <th className="border-b border-white/5 px-1.5 py-1.5 text-right font-medium">Return impact</th>
                </tr>
              </thead>
              <tbody>
                {holding.dividendHistory.map((row) => (
                  <tr key={row.id} className="border-t border-white/5">
                    <td className="whitespace-nowrap px-1.5 py-1.5 font-mono text-slate-300">{row.date}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono tabular text-slate-300">
                      {formatNumber(row.quantity)}
                    </td>
                    <td className="px-1.5 py-1.5 text-right font-mono tabular text-slate-100">
                      {formatCurrencyAmount(row.amountPerShare, row.currency)}
                    </td>
                    <td className="px-1.5 py-1.5 text-right font-mono tabular text-slate-100">
                      {formatCurrencyAmount(row.grossAmount, row.currency)}
                    </td>
                    <td className="px-1.5 py-1.5 text-right font-mono tabular text-slate-50">
                      {formatCurrencyNumber(row.grossAmountPortfolio)}
                    </td>
                    <td
                      className={cn(
                        "px-1.5 py-1.5 text-right font-mono tabular",
                        (row.returnImpactPercent ?? 0) >= 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      {formatPercent(row.returnImpactPercent, defaultNumberFormatPreferences, { sign: "always" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-2 rounded-md border border-white/10 px-2 py-2 text-[10px] text-slate-500">
            No dividend rows found since the first asset purchase.
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  type = "text",
}: {
  label: string;
  value?: string;
  type?: "text" | "number" | "date";
}) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] text-slate-500">{label}</span>
      <input
        type={type}
        defaultValue={value}
        className="h-9 w-full rounded-md border border-white/10 bg-background px-2.5 text-xs text-slate-100 outline-none focus:border-neutral/60"
      />
    </label>
  );
}

type AssetChartRange = "1D" | "1W" | "1M" | "YTD" | "1Y" | "5Y" | "10Y" | "ALL";
type AssetChartView = "line" | "candle";

type AssetChartPoint = {
  date: string;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  rawClose: number;
  volume: number | null;
  ma7?: number | null;
  ma200?: number | null;
};

type VisibleChartEvent = AssetChartEvent & {
  chartDate: string;
  chartPointDate: string;
  chartLabel: string;
  chartPrice: number;
};

type AssetChartResponse = {
  asset: {
    id: string;
    symbol: string;
    name: string | null;
  };
  range: AssetChartRange;
  source: "database" | "yahoo-intraday" | "demo";
  currency: string;
  assetCurrency?: string | null;
  portfolioCurrency?: string | null;
  delayNotice: string | null;
  latestMarketTime?: string | null;
  points: AssetChartPoint[];
};

const assetChartRanges = [
  { id: "1D", label: "Day" },
  { id: "1W", label: "Week" },
  { id: "1M", label: "Month" },
  { id: "YTD", label: "YTD" },
  { id: "1Y", label: "Year" },
  { id: "5Y", label: "5Y" },
  { id: "10Y", label: "10Y" },
  { id: "ALL", label: "All" },
] satisfies Array<{ id: AssetChartRange; label: string }>;

const assetChartViews = [
  { id: "line", label: "Line" },
  { id: "candle", label: "Candle" },
] satisfies Array<{ id: AssetChartView; label: string }>;

function withMovingAverages(points: AssetChartPoint[]) {
  return points.map((point, index) => {
    const ma7Window = points.slice(Math.max(0, index - 6), index + 1);
    const ma200Window = points.slice(Math.max(0, index - 199), index + 1);
    const average = (window: AssetChartPoint[], minimumLength: number) =>
      window.length >= minimumLength
        ? window.reduce((sum, item) => sum + item.close, 0) / window.length
        : null;

    return {
      ...point,
      ma7: average(ma7Window, 7),
      ma200: average(ma200Window, 200),
    };
  });
}

function compactChartTick(value: string, range: AssetChartRange) {
  if (range === "1D") {
    return value;
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (range === "1W" || range === "1M" || range === "YTD") {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }

  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function sampleCandlePoints(points: AssetChartPoint[], maxPoints = 120) {
  if (points.length <= maxPoints) {
    return points;
  }

  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, index) => index % step === 0 || index === points.length - 1);
}

function assetEventColor(type: AssetChartEvent["type"]) {
  if (type === "BUY") {
    return "#22C55E";
  }

  if (type === "SELL") {
    return "#EF4444";
  }

  return "#F8FAFC";
}

function assetEventLabel(type: AssetChartEvent["type"]) {
  if (type === "BUY") {
    return "Buy";
  }

  if (type === "SELL") {
    return "Sell";
  }

  return "Dividend";
}

function eventDateKey(date: string, range: AssetChartRange) {
  if (range === "1D" && date.includes("T")) {
    return date;
  }

  return date.slice(0, 10);
}

function chartDateKey(point: AssetChartPoint, range: AssetChartRange) {
  return eventDateKey(point.date, range);
}

function findEventPoint(points: AssetChartPoint[], event: AssetChartEvent, range: AssetChartRange) {
  const eventKey = eventDateKey(event.date, range);
  const exactPoint = points.find((point) => chartDateKey(point, range) === eventKey);

  if (exactPoint) {
    return exactPoint;
  }

  return points.find((point) => chartDateKey(point, range) >= eventKey) ?? null;
}

function buildVisibleChartEvents(
  events: AssetChartEvent[],
  points: AssetChartPoint[],
  range: AssetChartRange,
): VisibleChartEvent[] {
  if (points.length === 0) {
    return [];
  }

  const firstPointKey = chartDateKey(points[0], range);
  const lastPointKey = chartDateKey(points[points.length - 1], range);

  return events
    .filter((event) => {
      const key = eventDateKey(event.date, range);
      return key >= firstPointKey && key <= lastPointKey;
    })
    .flatMap((event) => {
      const point = findEventPoint(points, event, range);

      if (!point) {
        return [];
      }

      return [
        {
          ...event,
          chartDate: range === "1D" ? point.label : point.date,
          chartPointDate: point.date,
          chartLabel: point.label,
          chartPrice: point.close,
        },
      ];
    });
}

function paddedChartMin(value: number) {
  return value >= 0 ? value * 0.9 : value * 1.1;
}

function paddedChartMax(value: number) {
  return value >= 0 ? value * 1.1 : value * 0.9;
}

function AssetCandleSvg({
  data,
  events,
  currency,
  showMa7,
  showMa200,
}: {
  data: AssetChartPoint[];
  events: VisibleChartEvent[];
  currency: string;
  showMa7: boolean;
  showMa200: boolean;
}) {
  const candleData = sampleCandlePoints(data);
  const width = 760;
  const height = 230;
  const padding = { top: 10, right: 64, bottom: 22, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  if (candleData.length === 0) {
    return (
      <div className="grid h-full place-items-center rounded-md border border-white/10 text-xs text-slate-500">
        No price rows found.
      </div>
    );
  }

  const movingAverageValues = candleData.flatMap((point) => [
    showMa7 && point.ma7 !== null && point.ma7 !== undefined ? point.ma7 : null,
    showMa200 && point.ma200 !== null && point.ma200 !== undefined ? point.ma200 : null,
  ]).filter((value): value is number => value !== null);
  const minPrice = paddedChartMin(Math.min(...candleData.map((point) => point.low), ...movingAverageValues));
  const maxPrice = paddedChartMax(Math.max(...candleData.map((point) => point.high), ...movingAverageValues));
  const priceRange = Math.max(0.000001, maxPrice - minPrice);
  const xStep = candleData.length > 1 ? chartWidth / (candleData.length - 1) : chartWidth;
  const candleWidth = Math.max(2, Math.min(8, xStep * 0.55));
  const y = (value: number) => padding.top + ((maxPrice - value) / priceRange) * chartHeight;
  const gridValues = [0, 0.5, 1].map((fraction) => minPrice + priceRange * fraction);
  const eventMarkers = events.flatMap((event) => {
    const pointIndex = candleData.findIndex((point) => point.date >= event.chartPointDate);

    if (pointIndex < 0) {
      return [];
    }

    return [
      {
        event,
        x: padding.left + pointIndex * xStep,
        y: y(event.chartPrice),
      },
    ];
  });
  const movingAveragePolyline = (key: "ma7" | "ma200") =>
    candleData
      .map((point, index) => {
        const value = point[key];

        if (value === null || value === undefined) {
          return null;
        }

        return `${padding.left + index * xStep},${y(value)}`;
      })
      .filter((point): point is string => point !== null)
      .join(" ");

  return (
    <svg className="h-full w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img">
      {gridValues.map((value) => {
        const lineY = y(value);
        return (
          <g key={value}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={lineY}
              y2={lineY}
              stroke="rgba(148,163,184,0.12)"
            />
            <text
              x={width - padding.right + 8}
              y={lineY + 3}
              fill="#94A3B8"
              fontSize="10"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {formatCurrencyAmount(value, currency)}
            </text>
          </g>
        );
      })}
      {candleData.map((point, index) => {
        const x = padding.left + index * xStep;
        const isUp = point.close >= point.open;
        const color = isUp ? "#22C55E" : "#EF4444";
        const bodyTop = y(Math.max(point.open, point.close));
        const bodyBottom = y(Math.min(point.open, point.close));
        const bodyHeight = Math.max(1, bodyBottom - bodyTop);

        return (
          <g key={`${point.date}-${index}`}>
            <line x1={x} x2={x} y1={y(point.high)} y2={y(point.low)} stroke={color} strokeWidth="1.2" />
            <rect
              x={x - candleWidth / 2}
              y={bodyTop}
              width={candleWidth}
              height={bodyHeight}
              rx="1"
              fill={color}
              opacity="0.86"
            />
          </g>
        );
      })}
      {showMa7 ? (
        <polyline
          points={movingAveragePolyline("ma7")}
          fill="none"
          stroke="#34D399"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {showMa200 ? (
        <polyline
          points={movingAveragePolyline("ma200")}
          fill="none"
          stroke="#FBBF24"
          strokeWidth="2"
          strokeDasharray="7 5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {eventMarkers.map(({ event, x, y: eventY }) => (
        <g key={event.id}>
          <circle
            cx={x}
            cy={eventY}
            r="6"
            fill={assetEventColor(event.type)}
            stroke="#F8FAFC"
            strokeWidth="1.5"
          />
          <text
            x={x}
            y={eventY + 3}
            textAnchor="middle"
            fill={event.type === "DIVIDEND" ? "#0F1115" : "#F8FAFC"}
            fontSize="8"
            fontWeight="700"
          >
            {assetEventLabel(event.type)[0]}
          </text>
        </g>
      ))}
      <text x={padding.left} y={height - 5} fill="#64748B" fontSize="10">
        {candleData[0]?.label}
      </text>
      <text x={width - padding.right - 48} y={height - 5} fill="#64748B" fontSize="10">
        {candleData.at(-1)?.label}
      </text>
    </svg>
  );
}

function AssetChartLegend({ events }: { events: AssetChartEvent[] }) {
  const counts = events.reduce(
    (totals, event) => ({
      ...totals,
      [event.type]: totals[event.type] + 1,
    }),
    { BUY: 0, SELL: 0, DIVIDEND: 0 } satisfies Record<AssetChartEvent["type"], number>,
  );

  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
      {(["BUY", "SELL", "DIVIDEND"] satisfies AssetChartEvent["type"][])
        .filter((type) => counts[type] > 0)
        .map((type) => (
          <span key={type} className="flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-full border border-white/60"
              style={{ backgroundColor: assetEventColor(type) }}
            />
            {assetEventLabel(type)} {counts[type]}
          </span>
        ))}
    </div>
  );
}

function ChartScaffold({
  holding,
  portfolioCurrency,
  displayCurrency,
  showMa7,
  showMa200,
}: {
  holding: HoldingActionData;
  portfolioCurrency: string;
  displayCurrency: string;
  showMa7: boolean;
  showMa200: boolean;
}) {
  const [range, setRange] = useState<AssetChartRange>("1Y");
  const [view, setView] = useState<AssetChartView>("line");
  const [requestVersion, setRequestVersion] = useState(0);
  const [data, setData] = useState<AssetChartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const chartData = useMemo(() => withMovingAverages(data?.points ?? []), [data]);
  const visibleChartEvents = useMemo(
    () => buildVisibleChartEvents(holding.chartEvents, chartData, range),
    [holding.chartEvents, chartData, range],
  );
  const currency = data?.currency ?? displayCurrency;
  const latestPoint = chartData.at(-1);
  const firstPoint = chartData[0];
  const rangeChange =
    firstPoint && latestPoint && firstPoint.close > 0
      ? ((latestPoint.close - firstPoint.close) / firstPoint.close) * 100
      : null;
  const sourceLabel = isLoading && !data
    ? "Loading"
    : data?.source === "yahoo-intraday"
      ? "Yahoo intraday"
      : data?.source === "database"
        ? "Stored daily"
        : data?.source === "demo"
          ? "Demo"
          : "Price history";

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, 15000);

    async function loadAssetHistory() {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          range,
          currency: displayCurrency,
        });
        const response = await fetch(`/api/assets/${encodeURIComponent(holding.assetId)}/history?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Price history request failed with ${response.status}`);
        }

        const payload = (await response.json()) as AssetChartResponse;

        if (isActive) {
          setData(payload);
        }
      } catch (loadError) {
        if (isActive && !controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Price history request failed");
        } else if (isActive && didTimeout) {
          setError("Price history request timed out. The data source is available, but this browser request did not finish.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
        window.clearTimeout(timeoutId);
      }
    }

    void loadAssetHistory();

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [displayCurrency, holding.assetId, range, requestVersion]);

  return (
    <div className="space-y-2.5">
      <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
        <fieldset className="grid grid-cols-2 gap-1 rounded-md border border-white/10 bg-background/60 p-1">
          <legend className="sr-only">Asset chart view</legend>
          {assetChartViews.map((item) => (
            <label
              key={item.id}
              className={cn(
                "flex h-7 cursor-pointer items-center justify-center rounded px-1 text-[10px] font-medium",
                view === item.id ? "bg-neutral/20 text-blue-200" : "text-slate-500 hover:text-slate-200",
              )}
            >
              <input
                type="radio"
                name={`${holding.symbol}-asset-chart-view`}
                value={item.id}
                checked={view === item.id}
                onChange={() => setView(item.id)}
                className="sr-only"
              />
              {item.label}
            </label>
          ))}
        </fieldset>
        <fieldset className="grid grid-cols-4 gap-1 rounded-md border border-white/10 bg-background/60 p-1 sm:grid-cols-8">
          <legend className="sr-only">Asset chart date range</legend>
          {assetChartRanges.map((item) => (
            <label
              key={item.id}
              className={cn(
                "flex h-7 cursor-pointer items-center justify-center rounded px-1 text-[10px] font-medium",
                range === item.id ? "bg-neutral/20 text-blue-200" : "text-slate-500 hover:text-slate-200",
              )}
            >
              <input
                type="radio"
                name={`${holding.symbol}-asset-chart-range`}
                value={item.id}
                checked={range === item.id}
                onChange={() => setRange(item.id)}
                className="sr-only"
              />
              {item.label}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="relative h-64 rounded-md border border-white/10 bg-background p-2">
        <span className="pointer-events-none absolute right-3 top-2 z-10 rounded bg-background/70 px-1.5 py-0.5 text-[10px] text-slate-500 backdrop-blur">
          {sourceLabel}
          {isLoading ? " · loading" : ""}
        </span>
        {error ? (
          <div className="grid h-full place-items-center gap-2 text-center text-xs text-negative">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setRequestVersion((value) => value + 1)}
              className="h-7 rounded-md border border-white/10 px-2 text-[10px] font-medium text-slate-300 hover:border-neutral/50 hover:text-slate-50"
            >
              Retry
            </button>
          </div>
        ) : chartData.length === 0 && isLoading ? (
          <div className="grid h-full place-items-center text-xs text-slate-500">Loading price history...</div>
        ) : chartData.length === 0 ? (
          <div className="grid h-full place-items-center text-xs text-slate-500">No price rows found.</div>
        ) : view === "line" ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id={`${holding.symbol}-asset-value`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
              <XAxis
                dataKey={range === "1D" ? "label" : "date"}
                tickLine={false}
                axisLine={false}
                minTickGap={14}
                tick={{ fill: "#94A3B8", fontSize: 10 }}
                tickFormatter={(value: string) => compactChartTick(value, range)}
              />
              <YAxis
                width={96}
                domain={[paddedChartMin, paddedChartMax]}
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
                formatter={(value: number, name: string) => [
                  formatCurrencyAmount(value, currency),
                  name === "ma7"
                    ? "MA7"
                    : name === "ma200"
                      ? "MA200"
                      : name === "chartPrice"
                        ? "Event"
                        : "Close",
                ]}
                labelFormatter={(label: string) => label}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke="#3B82F6"
                strokeWidth={2}
                fill={`url(#${holding.symbol}-asset-value)`}
                dot={false}
              />
              {showMa7 ? (
                <Line
                  type="monotone"
                  dataKey="ma7"
                  stroke="#34D399"
                  strokeWidth={2.2}
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null}
              {showMa200 ? (
                <Line
                  type="monotone"
                  dataKey="ma200"
                  stroke="#FBBF24"
                  strokeWidth={2}
                  strokeDasharray="7 5"
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null}
              {visibleChartEvents.map((event) => (
                <ReferenceDot
                  key={event.id}
                  x={event.chartDate}
                  y={event.chartPrice}
                  r={5}
                  fill={assetEventColor(event.type)}
                  stroke="#F8FAFC"
                  strokeWidth={1.4}
                  label={{
                    value: assetEventLabel(event.type)[0],
                    fill: event.type === "DIVIDEND" ? "#0F1115" : "#F8FAFC",
                    fontSize: 8,
                    fontWeight: 700,
                    position: "center",
                  }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <AssetCandleSvg
            data={chartData}
            events={visibleChartEvents}
            currency={currency}
            showMa7={showMa7}
            showMa200={showMa200}
          />
        )}
      </div>

      {visibleChartEvents.length > 0 ? <AssetChartLegend events={visibleChartEvents} /> : null}

      {data?.delayNotice ? (
        <p className="text-[10px] leading-4 text-slate-500">{data.delayNotice}</p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md bg-background p-2">
          <p className="text-[10px] text-slate-500">Latest</p>
          <p className="font-mono text-xs text-slate-100">
            {latestPoint ? formatCurrencyAmount(latestPoint.close, currency) : "-"}
          </p>
        </div>
        <div className="rounded-md bg-background p-2">
          <p className="text-[10px] text-slate-500">Range</p>
          <p className={cn("font-mono text-xs", (rangeChange ?? 0) >= 0 ? "text-positive" : "text-negative")}>
            {rangeChange === null
              ? "-"
              : formatPercent(rangeChange, defaultNumberFormatPreferences, { sign: "always" })}
          </p>
        </div>
        <div className="rounded-md bg-background p-2">
          <p className="text-[10px] text-slate-500">Holding</p>
          <p className="font-mono text-xs text-slate-100">
            {formatCurrencyAmount(holding.valueCzk, portfolioCurrency)}
          </p>
        </div>
      </div>
    </div>
  );
}

function EditScaffold({ holding }: { holding: HoldingActionData }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Symbol" value={holding.symbol} />
      <Field label="Exchange" value={holding.exchange} />
      <Field label="Name" value={holding.name} />
      <Field label="Type" value={holding.type} />
      <Field label="Currency" value={holding.currency} />
      <Field label="Target allocation" value={holding.allocation.toFixed(2)} type="number" />
    </div>
  );
}

function TradeScaffold({ holding, action }: { holding: HoldingActionData; action: "buy" | "sell" }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Symbol" value={holding.symbol} />
      <Field label="Trade date" value={new Date().toISOString().slice(0, 10)} type="date" />
      <Field label="Quantity" type="number" />
      <Field label="Price" type="number" />
      <Field label="Fee" value="0" type="number" />
      <Field label="Tax" value="0" type="number" />
      <div className="rounded-md bg-background p-3 sm:col-span-2">
        <p className="text-xs text-slate-400">{action === "buy" ? "BUY" : "SELL"}</p>
        <p className="mt-1 font-mono text-sm text-slate-100">
          {holding.symbol} · {holding.currency}
        </p>
      </div>
    </div>
  );
}

function FloatingTransactionHistoryWindow({
  holding,
  portfolioCurrency,
  zIndex,
  onClose,
  onFocus,
}: {
  holding: HoldingActionData;
  portfolioCurrency: string;
  zIndex: number;
  onClose: () => void;
  onFocus: () => void;
}) {
  const [position, setPosition] = useState(() => initialWindowPosition(holding.symbol));
  const [drag, setDrag] = useState<{
    originX: number;
    originY: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    onFocus();
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

    const maxX = Math.max(8, window.innerWidth - 260);
    const maxY = Math.max(8, window.innerHeight - 96);

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

  return (
    <section
      className="transaction-history-surface fixed max-h-[min(72vh,620px)] w-[min(760px,calc(100vw-1rem))] min-w-[min(560px,calc(100vw-1rem))] resize overflow-auto rounded-lg border border-emerald-300/15 text-left shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
      style={{ left: position.x, top: position.y, zIndex }}
      onPointerDown={onFocus}
    >
      <div
        className="transaction-history-surface-header sticky top-0 z-10 flex cursor-move touch-none items-center justify-between gap-3 border-b border-emerald-300/10 px-3 py-2 backdrop-blur"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{holding.symbol}</p>
          <h2 className="truncate text-sm font-semibold text-slate-50">{holding.name} history</h2>
        </div>
        <div className="flex items-center gap-1">
          <span className="hidden rounded bg-background px-2 py-1 font-mono text-[10px] text-slate-400 sm:inline">
            {holding.currency}
          </span>
          <button
            type="button"
            aria-label={`Close ${holding.symbol} transaction history`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-slate-50"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="p-2.5">
        <TransactionHistoryScaffold holding={holding} portfolioCurrency={portfolioCurrency} />
      </div>
    </section>
  );
}

function FloatingAssetChartWindow({
  holding,
  portfolioCurrency,
  zIndex,
  onClose,
  onFocus,
}: {
  holding: HoldingActionData;
  portfolioCurrency: string;
  zIndex: number;
  onClose: () => void;
  onFocus: () => void;
}) {
  const assetCurrency = holding.currency.toUpperCase();
  const baseCurrency = portfolioCurrency.toUpperCase();
  const canSwitchCurrency = assetCurrency !== baseCurrency;
  const [displayCurrency, setDisplayCurrency] = useState(assetCurrency);
  const [showMa7, setShowMa7] = useState(false);
  const [showMa200, setShowMa200] = useState(false);
  const [position, setPosition] = useState(() => {
    const initialPosition = initialWindowPosition(holding.symbol);
    return {
      x: initialPosition.x + 24,
      y: initialPosition.y + 24,
    };
  });
  const [drag, setDrag] = useState<{
    originX: number;
    originY: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    onFocus();
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

    const maxX = Math.max(8, window.innerWidth - 280);
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

  return (
    <section
      className="asset-chart-surface fixed h-[500px] max-h-[min(82vh,720px)] min-h-[400px] w-[min(640px,calc(100vw-1rem))] min-w-[min(500px,calc(100vw-1rem))] resize overflow-auto rounded-lg border border-red-300/15 text-left shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
      style={{ left: position.x, top: position.y, zIndex }}
      onPointerDown={onFocus}
    >
      <div
        className="asset-chart-surface-header sticky top-0 z-10 flex cursor-move touch-none items-center justify-between gap-3 border-b border-red-300/10 px-3 py-2 backdrop-blur"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{holding.symbol}</p>
          <h2 className="truncate text-sm font-semibold text-slate-50">{holding.name} chart</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={`${showMa7 ? "Hide" : "Show"} MA7 indicator for ${holding.symbol}`}
            aria-pressed={showMa7}
            title={`${showMa7 ? "Hide" : "Show"} MA7`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setShowMa7((value) => !value);
            }}
            className={cn(
              "h-6 rounded border px-1.5 font-mono text-[10px]",
              showMa7
                ? "border-emerald-300/50 bg-emerald-500/15 text-emerald-200"
                : "border-white/10 bg-background text-slate-500 hover:text-slate-200",
            )}
          >
            MA7
          </button>
          <button
            type="button"
            aria-label={`${showMa200 ? "Hide" : "Show"} MA200 indicator for ${holding.symbol}`}
            aria-pressed={showMa200}
            title={`${showMa200 ? "Hide" : "Show"} MA200`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setShowMa200((value) => !value);
            }}
            className={cn(
              "h-6 rounded border px-1.5 font-mono text-[10px]",
              showMa200
                ? "border-amber-300/50 bg-amber-500/15 text-amber-200"
                : "border-white/10 bg-background text-slate-500 hover:text-slate-200",
            )}
          >
            MA200
          </button>
          <button
            type="button"
            aria-label={
              canSwitchCurrency
                ? `Switch ${holding.symbol} chart currency to ${
                    displayCurrency === assetCurrency ? baseCurrency : assetCurrency
                  }`
                : `${holding.symbol} chart currency ${displayCurrency}`
            }
            title={
              canSwitchCurrency
                ? `Switch chart currency to ${displayCurrency === assetCurrency ? baseCurrency : assetCurrency}`
                : `Chart currency ${displayCurrency}`
            }
            disabled={!canSwitchCurrency}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (canSwitchCurrency) {
                setDisplayCurrency((currency) => (currency === assetCurrency ? baseCurrency : assetCurrency));
              }
            }}
            className={cn(
              "rounded bg-background px-2 py-1 font-mono text-[10px] text-slate-400",
              canSwitchCurrency
                ? "border border-neutral/40 hover:border-neutral hover:text-slate-50"
                : "cursor-default border border-transparent opacity-70",
            )}
          >
            {displayCurrency}
          </button>
          <button
            type="button"
            aria-label={`Close ${holding.symbol} asset chart`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-slate-50"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="p-3">
        <ChartScaffold
          holding={holding}
          portfolioCurrency={portfolioCurrency}
          displayCurrency={displayCurrency}
          showMa7={showMa7}
          showMa200={showMa200}
        />
      </div>
    </section>
  );
}

export function HoldingActions({ holding, portfolioCurrency }: HoldingActionsProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [modalAction, setModalAction] = useState<ModalHoldingAction | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isChartOpen, setIsChartOpen] = useState(false);
  const [historyWindowZIndex, setHistoryWindowZIndex] = useState(nextFloatingWindowZIndex);
  const [chartWindowZIndex, setChartWindowZIndex] = useState(nextFloatingWindowZIndex);

  function nextWindowZIndex() {
    nextFloatingWindowZIndex += 1;
    return nextFloatingWindowZIndex;
  }

  function focusHistoryWindow() {
    setHistoryWindowZIndex(nextWindowZIndex());
  }

  function focusChartWindow() {
    setChartWindowZIndex(nextWindowZIndex());
  }

  function openAction(action: HoldingAction) {
    setIsMenuOpen(false);

    if (action === "history") {
      setIsHistoryOpen(true);
      focusHistoryWindow();
      return;
    }

    if (action === "chart") {
      setIsChartOpen(true);
      focusChartWindow();
      return;
    }

    setModalAction(action);
  }

  return (
    <div className="relative flex shrink-0 justify-start">
      <button
        type="button"
        aria-label={`${holding.symbol} actions`}
        onClick={() => setIsMenuOpen((value) => !value)}
        className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] border border-white/10 text-slate-400 hover:border-neutral/50 hover:text-slate-50"
      >
        <MoreHorizontal size={13} />
      </button>

      {isMenuOpen ? (
        <div className="absolute left-0 top-7 z-[1000] w-44 rounded-lg border border-white/10 bg-panel p-1 shadow-panel">
          {actionItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openAction(item.id)}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-slate-300 hover:bg-surface hover:text-slate-50"
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {isHistoryOpen ? (
        <FloatingTransactionHistoryWindow
          holding={holding}
          portfolioCurrency={portfolioCurrency}
          zIndex={historyWindowZIndex}
          onClose={() => setIsHistoryOpen(false)}
          onFocus={focusHistoryWindow}
        />
      ) : null}

      {isChartOpen ? (
        <FloatingAssetChartWindow
          holding={holding}
          portfolioCurrency={portfolioCurrency}
          zIndex={chartWindowZIndex}
          onClose={() => setIsChartOpen(false)}
          onFocus={focusChartWindow}
        />
      ) : null}

      {modalAction ? (
        <div className="fixed inset-0 z-50 grid min-h-screen place-items-center bg-black/55 px-4 py-6 backdrop-blur-sm">
          <section
            className={cn(
              "max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-white/10 bg-panel p-4 text-left shadow-panel",
              "max-w-lg",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{holding.symbol}</p>
                <h2 className="truncate text-base font-semibold text-slate-50">{modalTitle(modalAction)}</h2>
              </div>
              <button
                type="button"
                aria-label="Close asset action"
                onClick={() => setModalAction(null)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-slate-50"
              >
                <X size={15} />
              </button>
            </div>

            <div className="mt-4">
              {modalAction === "edit" ? <EditScaffold holding={holding} /> : null}
              {modalAction === "buy" || modalAction === "sell" ? (
                <TradeScaffold holding={holding} action={modalAction} />
              ) : null}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalAction(null)}
                className="h-9 rounded-md border border-white/10 px-3 text-xs font-medium text-slate-300 hover:border-neutral/50 hover:text-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                className="flex h-9 items-center gap-2 rounded-md bg-neutral px-3 text-xs font-medium text-white hover:bg-blue-500"
              >
                <Save size={14} />
                Save draft
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
