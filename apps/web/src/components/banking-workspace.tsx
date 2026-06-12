"use client";

import { type FormEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Landmark,
  LineChart,
  MoreHorizontal,
  Pencil,
  ReceiptText,
  Save,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BankingAccount, BankingBalanceSnapshot, BankingData, BankingTimelineEvent } from "@/lib/banking-data";
import { formatCurrencyAmount, formatCurrencyNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type BankingAccountFilter = "credits" | "debits" | "liquid" | "longTerm";
type AccountAction = "chart" | "balance" | "transaction" | "edit" | "delete";
type ModalAccountAction = Exclude<AccountAction, "chart" | "delete">;
type MenuDirection = "down" | "up";
type AccountChartRange = "1Y" | "5Y" | "10Y" | "ALL";

const accountFilters = [
  { id: "credits", label: "Credits" },
  { id: "debits", label: "Debits" },
  { id: "liquid", label: "Liquid" },
  { id: "longTerm", label: "Long term" },
] satisfies Array<{ id: BankingAccountFilter; label: string }>;

const accountActionItems = [
  { id: "chart", label: "Time chart", icon: LineChart },
  { id: "balance", label: "Add/Edit balance", icon: WalletCards },
  { id: "transaction", label: "Transaction", icon: ReceiptText },
  { id: "edit", label: "Edit account", icon: Pencil },
  { id: "delete", label: "Delete account", icon: Trash2 },
] satisfies Array<{ id: AccountAction; label: string; icon: typeof WalletCards }>;

const accountChartRanges = [
  { id: "1Y", label: "1Y" },
  { id: "5Y", label: "5Y" },
  { id: "10Y", label: "10Y" },
  { id: "ALL", label: "All" },
] satisfies Array<{ id: AccountChartRange; label: string }>;

let nextFloatingAccountChartZIndex = 80;

const editableAccountTypes = [
  "CURRENT",
  "SAVINGS",
  "CASH_WALLET",
  "CREDIT_CARD",
  "LOAN",
  "MORTGAGE",
  "PRIVATE_LOAN",
  "OTHER_ASSET",
  "OTHER_LIABILITY",
];

const editableDirections = ["ASSET", "LIABILITY", "RECEIVABLE"];

const editablePartnerKinds = ["PERSON", "COMPANY", "INSTITUTION", "GOVERNMENT", "HOUSEHOLD", "UNKNOWN"];

const editablePartnerRoles = [
  "BANK",
  "BROKER",
  "INSURER",
  "EMPLOYER",
  "LANDLORD",
  "TENANT",
  "LENDER",
  "BORROWER",
  "UTILITY_PROVIDER",
  "SERVICE_PROVIDER",
  "STATE_INSTITUTION",
  "TAX_AUTHORITY",
  "HEALTH_INSURANCE",
  "PENSION_PROVIDER",
  "PHYSICAL_PERSON",
  "MERCHANT",
  "OTHER",
];

const editableRateTypes = ["SAVINGS_INTEREST", "LOAN_INTEREST", "CARD_APR", "PROMOTIONAL", "OTHER"];
const editableCapitalizationPeriods = ["", "DAILY", "MONTHLY", "QUARTERLY", "YEARLY", "AT_MATURITY"];
const editableFacilityTypes = ["CREDIT_CARD", "MORTGAGE", "CONSUMER_LOAN", "PRIVATE_LOAN", "OTHER"];
const editableFacilityDirections = ["BORROWED", "LENT"];
const editableTransactionDirections = ["INFLOW", "OUTFLOW"] as const;
const editableTransactionTypes = [
  "INCOME",
  "SPEND",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "SERVICE_PAYMENT",
  "UTILITY_PAYMENT",
  "INSURANCE_PAYMENT",
  "LOAN_PAYMENT",
  "INTEREST_INCOME",
  "INTEREST_EXPENSE",
  "FEE",
  "TAX",
  "ADJUSTMENT",
] as const;

function valueTone(value: number) {
  if (value > 0) {
    return "text-positive";
  }

  if (value < 0) {
    return "text-negative";
  }

  return "text-slate-400";
}

function cardTone(tone: "blue" | "green" | "red") {
  return cn(
    tone === "blue" && "bg-neutral/10 text-blue-300",
    tone === "green" && "bg-positive/10 text-positive",
    tone === "red" && "bg-negative/10 text-negative",
  );
}

function eventMarkerStroke(tone: BankingTimelineEvent["tone"]) {
  if (tone === "negative") {
    return "#EF4444";
  }

  if (tone === "positive") {
    return "#22C55E";
  }

  if (tone === "warning") {
    return "#F59E0B";
  }

  return "#3B82F6";
}

function accountValue(account: BankingAccount) {
  return account.direction === "LIABILITY" ? -account.balance : account.balance;
}

function isLiquidAccount(account: BankingAccount) {
  return account.direction === "ASSET" && ["CASH_WALLET", "CURRENT"].includes(account.accountType);
}

function isCreditAccount(account: BankingAccount) {
  return account.direction === "ASSET" || account.direction === "RECEIVABLE";
}

function accountTypeLabel(type: string) {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function localDateTimeLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formInputClassName() {
  return "h-9 rounded-md border border-white/10 bg-background px-2 text-xs text-slate-100 outline-none focus:border-neutral/60";
}

function balanceSnapshotRows(snapshots: BankingBalanceSnapshot[]) {
  return [...snapshots].sort(
    (left, right) =>
      right.balanceDate.localeCompare(left.balanceDate) || right.createdAt.localeCompare(left.createdAt),
  );
}

function initialWindowPosition(seed: string) {
  const hash = Array.from(seed).reduce((sum, character) => sum + character.charCodeAt(0), 0);

  return {
    x: 16 + (hash % 120),
    y: 96 + (hash % 80),
  };
}

function addUtcMonths(date: Date, months: number) {
  const nextDate = new Date(date);
  nextDate.setUTCMonth(nextDate.getUTCMonth() + months);
  return nextDate;
}

function dateToTimestamp(date: string) {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function timestampToDateKey(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

function signedSnapshotValue(account: BankingAccount, snapshot: BankingBalanceSnapshot) {
  return account.direction === "LIABILITY" ? -snapshot.balance : snapshot.balance;
}

function centeredChartWindow(range: AccountChartRange) {
  if (range === "ALL") {
    return null;
  }

  const totalMonths = range === "1Y" ? 12 : range === "5Y" ? 60 : 120;
  const today = new Date();
  const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const startDate = addUtcMonths(todayDate, -(totalMonths / 2));
  const endDate = addUtcMonths(todayDate, totalMonths / 2);

  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    startTime: startDate.getTime(),
    endTime: endDate.getTime(),
    todayTime: todayDate.getTime(),
  };
}

function AccountTimeChart({
  account,
  range,
}: {
  account: BankingAccount;
  range: AccountChartRange;
}) {
  const chartWindow = useMemo(() => centeredChartWindow(range), [range]);
  const chartData = useMemo(() => {
    const points = chartWindow
      ? account.balanceSeries.filter((point) => point.date >= chartWindow.startDate && point.date <= chartWindow.endDate)
      : account.balanceSeries;

    return points.map((point) => ({
      ...point,
      timestamp: dateToTimestamp(point.date),
    }));
  }, [account.balanceSeries, chartWindow]);
  const actualSnapshotPoints = useMemo(() => {
    const snapshots = chartWindow
      ? account.balanceSnapshots.filter(
          (snapshot) => snapshot.balanceDate >= chartWindow.startDate && snapshot.balanceDate <= chartWindow.endDate,
        )
      : account.balanceSnapshots;

    return snapshots.map((snapshot) => ({
      ...snapshot,
      timestamp: dateToTimestamp(snapshot.balanceDate),
      value: signedSnapshotValue(account, snapshot),
    }));
  }, [account, chartWindow]);
  const chartDomain = useMemo(
    () => buildCurrencyAxis([...chartData.map((point) => point.value), ...actualSnapshotPoints.map((point) => point.value)]),
    [actualSnapshotPoints, chartData],
  );
  const latestValue = chartData.at(-1)?.value ?? accountValue(account);
  const firstValue = chartData[0]?.value ?? latestValue;
  const delta = latestValue - firstValue;
  const todayTime = chartWindow?.todayTime ?? dateToTimestamp(todayKey());

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-background/70 p-2">
          <p className="text-[10px] text-slate-500">Forecast value</p>
          <p className={cn("mt-1 font-mono text-sm font-semibold tabular", valueTone(latestValue))}>
            {formatCurrencyAmount(latestValue, account.currency)}
          </p>
        </div>
        <div className="rounded-md bg-background/70 p-2">
          <p className="text-[10px] text-slate-500">Window change</p>
          <p className={cn("mt-1 font-mono text-sm font-semibold tabular", valueTone(delta))}>
            {delta >= 0 ? "+" : "-"}
            {formatCurrencyAmount(Math.abs(delta), account.currency)}
          </p>
        </div>
      </div>

      <div className="h-72 min-h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id={`accountBalance-${account.id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor={account.direction === "LIABILITY" ? "#EF4444" : "#3B82F6"} stopOpacity={0.55} />
                <stop offset="95%" stopColor={account.direction === "LIABILITY" ? "#EF4444" : "#3B82F6"} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={chartWindow ? [chartWindow.startTime, chartWindow.endTime] : ["dataMin", "dataMax"]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#94A3B8", fontSize: 11 }}
              minTickGap={14}
              tickFormatter={(value: number) => timelineTick(timestampToDateKey(value))}
            />
            <YAxis
              width={112}
              domain={chartDomain}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#94A3B8", fontSize: 9 }}
              tickFormatter={(value: number) => formatCurrencyAmount(value, account.currency)}
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
              formatter={(value: number) => [formatCurrencyAmount(value, account.currency), "Balance"]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
            />
            <ReferenceLine x={todayTime} stroke="rgba(245,158,11,0.55)" strokeDasharray="4 4" ifOverflow="extendDomain" />
            <Area
              type="linear"
              dataKey="value"
              stroke={account.direction === "LIABILITY" ? "#EF4444" : "#3B82F6"}
              strokeWidth={2}
              fill={`url(#accountBalance-${account.id})`}
            />
            {actualSnapshotPoints.map((snapshot) => (
              <ReferenceDot
                key={snapshot.id}
                x={snapshot.timestamp}
                y={snapshot.value}
                r={4}
                fill="#151922"
                stroke="#F59E0B"
                strokeWidth={2}
                ifOverflow="extendDomain"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full border-2 border-warning bg-panel" />
          Actual balance snapshot
        </span>
        <span>{actualSnapshotPoints.length} in range</span>
      </div>
    </div>
  );
}

function FloatingAccountChartWindow({
  account,
  initialRange,
  zIndex,
  onClose,
  onFocus,
}: {
  account: BankingAccount;
  initialRange: AccountChartRange;
  zIndex: number;
  onClose: () => void;
  onFocus: () => void;
}) {
  const [range, setRange] = useState<AccountChartRange>(initialRange);
  const [position, setPosition] = useState(() => initialWindowPosition(account.id));
  const windowRef = useRef<HTMLElement | null>(null);
  const [drag, setDrag] = useState<{
    originX: number;
    originY: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);

  useEffect(() => {
    function clampWindowToViewport() {
      const bounds = windowRef.current?.getBoundingClientRect();
      const width = bounds?.width ?? Math.min(640, window.innerWidth - 16);
      const height = bounds?.height ?? Math.min(500, window.innerHeight - 16);

      setPosition((current) => {
        const maxX = Math.max(8, window.innerWidth - width - 8);
        const maxY = Math.max(8, window.innerHeight - height - 8);
        const nextPosition = {
          x: Math.min(Math.max(8, current.x), maxX),
          y: Math.min(Math.max(8, current.y), maxY),
        };

        return nextPosition.x === current.x && nextPosition.y === current.y ? current : nextPosition;
      });
    }

    clampWindowToViewport();
    window.addEventListener("resize", clampWindowToViewport);

    return () => window.removeEventListener("resize", clampWindowToViewport);
  }, []);

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

    const bounds = windowRef.current?.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - (bounds?.width ?? 280) - 8);
    const maxY = Math.max(8, window.innerHeight - (bounds?.height ?? 120) - 8);

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
      ref={windowRef}
      className="fixed h-[min(500px,calc(100dvh-1rem))] max-h-[calc(100dvh-1rem)] min-h-0 w-[calc(100vw-1rem)] max-w-[640px] min-w-0 resize overflow-auto rounded-lg border border-blue-300/15 bg-panel text-left shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
      style={{ left: position.x, top: position.y, zIndex }}
      onPointerDown={onFocus}
    >
      <div
        className="sticky top-0 z-10 flex cursor-move touch-none items-center justify-between gap-3 border-b border-blue-300/10 bg-panel/95 px-3 py-2 backdrop-blur"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{accountTypeLabel(account.accountType)}</p>
          <h2 className="truncate text-sm font-semibold text-slate-50">{account.name} time chart</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <fieldset className="grid grid-cols-4 gap-1 rounded-md border border-white/10 bg-background/60 p-1">
            <legend className="sr-only">Account chart range</legend>
            {accountChartRanges.map((item) => (
              <label
                key={item.id}
                className={cn(
                  "flex h-6 cursor-pointer items-center justify-center rounded px-1.5 text-[10px] font-medium",
                  range === item.id ? "bg-neutral/20 text-blue-200" : "text-slate-500 hover:text-slate-200",
                )}
              >
                <input
                  type="radio"
                  name={`account-chart-range-${account.id}`}
                  value={item.id}
                  checked={range === item.id}
                  onChange={() => setRange(item.id)}
                  className="sr-only"
                />
                {item.label}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            aria-label={`Close ${account.name} account chart`}
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
        <AccountTimeChart account={account} range={range} />
      </div>
    </section>
  );
}

function BalanceManager({ account, onClose }: { account: BankingAccount; onClose: () => void }) {
  const router = useRouter();
  const [snapshots, setSnapshots] = useState(() => balanceSnapshotRows(account.balanceSnapshots));
  const [newBalance, setNewBalance] = useState(String(account.balance));
  const [newBalanceDate, setNewBalanceDate] = useState(todayKey());
  const [newNotes, setNewNotes] = useState("");
  const [editingRows, setEditingRows] = useState<Record<string, { balance: string; balanceDate: string; notes: string }>>(
    () =>
      Object.fromEntries(
        account.balanceSnapshots.map((snapshot) => [
          snapshot.id,
          {
            balance: String(snapshot.balance),
            balanceDate: snapshot.balanceDate,
            notes: snapshot.notes ?? "",
          },
        ]),
      ),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function updateEditingRow(snapshotId: string, field: "balance" | "balanceDate" | "notes", value: string) {
    setEditingRows((current) => ({
      ...current,
      [snapshotId]: {
        ...current[snapshotId],
        [field]: value,
      },
    }));
  }

  function refreshSnapshot(snapshot: BankingBalanceSnapshot) {
    setSnapshots((current) => balanceSnapshotRows([...current.filter((item) => item.id !== snapshot.id), snapshot]));
    setEditingRows((current) => ({
      ...current,
      [snapshot.id]: {
        balance: String(snapshot.balance),
        balanceDate: snapshot.balanceDate,
        notes: snapshot.notes ?? "",
      },
    }));
    router.refresh();
  }

  async function saveNewSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setPendingId("new");

    try {
      const response = await fetch(`/api/banking/accounts/${account.id}/balance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          balance: newBalance,
          balanceDate: newBalanceDate,
          notes: newNotes,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        snapshot?: BankingBalanceSnapshot;
      };

      if (!response.ok || !result.snapshot) {
        throw new Error(result.error ?? "Could not add balance.");
      }

      refreshSnapshot(result.snapshot);
      setNewBalance(String(result.snapshot.balance));
      setNewBalanceDate(todayKey());
      setNewNotes("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not add balance.");
    } finally {
      setPendingId(null);
    }
  }

  async function updateSnapshot(snapshotId: string) {
    const row = editingRows[snapshotId];

    if (!row) {
      return;
    }

    setStatus(null);
    setPendingId(snapshotId);

    try {
      const response = await fetch(`/api/banking/accounts/${account.id}/balance`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          snapshotId,
          balance: row.balance,
          balanceDate: row.balanceDate,
          notes: row.notes,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        snapshot?: BankingBalanceSnapshot;
      };

      if (!response.ok || !result.snapshot) {
        throw new Error(result.error ?? "Could not update balance.");
      }

      refreshSnapshot(result.snapshot);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update balance.");
    } finally {
      setPendingId(null);
    }
  }

  async function deleteSnapshot(snapshotId: string) {
    if (!window.confirm("Are you sure?")) {
      return;
    }

    setStatus(null);
    setPendingId(snapshotId);

    try {
      const response = await fetch(`/api/banking/accounts/${account.id}/balance`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshotId }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Could not delete balance.");
      }

      setSnapshots((current) => current.filter((snapshot) => snapshot.id !== snapshotId));
      setEditingRows((current) => {
        const nextRows = { ...current };
        delete nextRows[snapshotId];
        return nextRows;
      });
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete balance.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="grid gap-3">
      <form onSubmit={saveNewSnapshot} className="grid gap-3 rounded-md border border-white/10 p-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_minmax(0,1.4fr)_auto]">
          <label className="grid gap-1 text-xs text-slate-400">
            New balance
            <input
              value={newBalance}
              onChange={(event) => setNewBalance(event.target.value)}
              className={formInputClassName()}
              inputMode="decimal"
              required
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-400">
            Date
            <input
              type="date"
              value={newBalanceDate}
              onChange={(event) => setNewBalanceDate(event.target.value)}
              className={formInputClassName()}
              required
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-400">
            Notes
            <input
              value={newNotes}
              onChange={(event) => setNewNotes(event.target.value)}
              className={formInputClassName()}
            />
          </label>
          <button
            type="submit"
            disabled={pendingId === "new"}
            className="mt-5 flex h-9 items-center justify-center gap-2 rounded-md bg-neutral px-3 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={14} />
            Add
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-md border border-white/10">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-xs">
          <thead className="bg-background/70 text-slate-500">
            <tr>
              <th className="border-b border-white/10 px-3 py-2 font-medium">Balance date</th>
              <th className="border-b border-white/10 px-3 py-2 text-right font-medium">Balance</th>
              <th className="border-b border-white/10 px-3 py-2 font-medium">Notes</th>
              <th className="border-b border-white/10 px-3 py-2 font-medium">Source</th>
              <th className="border-b border-white/10 px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((snapshot) => {
              const row = editingRows[snapshot.id] ?? {
                balance: String(snapshot.balance),
                balanceDate: snapshot.balanceDate,
                notes: snapshot.notes ?? "",
              };

              return (
                <tr key={snapshot.id} className="text-slate-200">
                  <td className="border-b border-white/5 px-3 py-2">
                    <input
                      type="date"
                      value={row.balanceDate}
                      onChange={(event) => updateEditingRow(snapshot.id, "balanceDate", event.target.value)}
                      className={formInputClassName()}
                    />
                    <p className="mt-1 text-[10px] text-slate-600">{localDateTimeLabel(snapshot.createdAt)}</p>
                  </td>
                  <td className="border-b border-white/5 px-3 py-2">
                    <input
                      value={row.balance}
                      onChange={(event) => updateEditingRow(snapshot.id, "balance", event.target.value)}
                      className={cn(formInputClassName(), "text-right font-mono tabular")}
                      inputMode="decimal"
                    />
                    <p className="mt-1 text-right font-mono text-[10px] text-slate-600">{snapshot.currency}</p>
                  </td>
                  <td className="border-b border-white/5 px-3 py-2">
                    <input
                      value={row.notes}
                      onChange={(event) => updateEditingRow(snapshot.id, "notes", event.target.value)}
                      className={formInputClassName()}
                    />
                  </td>
                  <td className="border-b border-white/5 px-3 py-2 text-slate-500">{snapshot.source}</td>
                  <td className="border-b border-white/5 px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => void updateSnapshot(snapshot.id)}
                        disabled={pendingId === snapshot.id}
                        className="flex h-8 items-center gap-1 rounded-md border border-white/10 px-2 text-[11px] text-slate-300 hover:border-neutral/50 hover:text-slate-50 disabled:opacity-60"
                      >
                        <Save size={13} />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteSnapshot(snapshot.id)}
                        disabled={pendingId === snapshot.id}
                        className="flex h-8 items-center gap-1 rounded-md border border-negative/30 px-2 text-[11px] text-negative hover:bg-negative/10 disabled:opacity-60"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {snapshots.length === 0 ? (
          <div className="px-3 py-6 text-xs text-slate-500">No balance snapshots yet.</div>
        ) : null}
      </div>

      {status ? <p className="rounded-md bg-negative/10 px-3 py-2 text-xs text-negative">{status}</p> : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-md border border-white/10 px-3 text-xs font-medium text-slate-300 hover:border-neutral/50 hover:text-slate-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function AccountTransactionManager({ account, onClose }: { account: BankingAccount; onClose: () => void }) {
  const router = useRouter();
  const [transactionDate, setTransactionDate] = useState(todayKey());
  const [direction, setDirection] = useState<(typeof editableTransactionDirections)[number]>(
    account.direction === "LIABILITY" ? "OUTFLOW" : "INFLOW",
  );
  const [transactionType, setTransactionType] = useState<(typeof editableTransactionTypes)[number]>(
    account.direction === "LIABILITY" ? "LOAN_PAYMENT" : "INCOME",
  );
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/banking/accounts/${account.id}/transaction`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transactionDate,
          direction,
          transactionType,
          amount,
          description,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Could not save transaction.");
      }

      router.refresh();
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save transaction.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={saveTransaction} className="grid gap-3">
      <fieldset className="grid gap-3 rounded-md border border-white/10 p-3">
        <legend className="px-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">Transaction</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="grid gap-1 text-xs text-slate-400">
            Date
            <input
              type="date"
              value={transactionDate}
              onChange={(event) => setTransactionDate(event.target.value)}
              className={formInputClassName()}
              required
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-400">
            Direction
            <select
              value={direction}
              onChange={(event) => setDirection(event.target.value as (typeof editableTransactionDirections)[number])}
              className={formInputClassName()}
            >
              {editableTransactionDirections.map((item) => (
                <option key={item} className="bg-background text-slate-100" value={item}>
                  {accountTypeLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-slate-400 sm:col-span-2">
            Type
            <select
              value={transactionType}
              onChange={(event) => setTransactionType(event.target.value as (typeof editableTransactionTypes)[number])}
              className={formInputClassName()}
            >
              {editableTransactionTypes.map((item) => (
                <option key={item} className="bg-background text-slate-100" value={item}>
                  {accountTypeLabel(item)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <label className="grid gap-1 text-xs text-slate-400">
            Amount {account.currency}
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={cn(formInputClassName(), "font-mono tabular")}
              inputMode="decimal"
              required
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-400">
            Description
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={formInputClassName()}
            />
          </label>
        </div>
      </fieldset>

      {status ? <p className="rounded-md bg-negative/10 px-3 py-2 text-xs text-negative">{status}</p> : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-md border border-white/10 px-3 text-xs font-medium text-slate-300 hover:border-neutral/50 hover:text-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="flex h-9 items-center gap-2 rounded-md bg-neutral px-3 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={14} />
          {isSaving ? "Saving" : "Save transaction"}
        </button>
      </div>
    </form>
  );
}

function AccountActionDialog({
  account,
  action,
  onClose,
}: {
  account: BankingAccount;
  action: ModalAccountAction;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(account.name);
  const [accountType, setAccountType] = useState(account.accountType);
  const [direction, setDirection] = useState(account.direction);
  const [currency, setCurrency] = useState(account.currency);
  const [partnerName, setPartnerName] = useState(account.partnerName);
  const [partnerRole, setPartnerRole] = useState(account.partnerRole);
  const [partnerKind, setPartnerKind] = useState(account.partnerKind);
  const [partnerLegalName, setPartnerLegalName] = useState(account.partnerLegalName ?? "");
  const [partnerWebsite, setPartnerWebsite] = useState(account.partnerWebsite ?? "");
  const [partnerNotes, setPartnerNotes] = useState(account.partnerNotes ?? "");
  const [openingDate, setOpeningDate] = useState(account.openingDate ?? "");
  const [targetCloseDate, setTargetCloseDate] = useState(account.targetCloseDate ?? "");
  const [accountNumberMask, setAccountNumberMask] = useState(account.accountNumberMask ?? "");
  const [ibanMask, setIbanMask] = useState(account.ibanMask ?? "");
  const [creditLimit, setCreditLimit] = useState(account.creditLimit === null ? "" : String(account.creditLimit));
  const [includeInNetWorth, setIncludeInNetWorth] = useState(account.includeInNetWorth);
  const [rateType, setRateType] = useState(
    account.rateType ?? (account.direction === "LIABILITY" ? "LOAN_INTEREST" : "SAVINGS_INTEREST"),
  );
  const [ratePercent, setRatePercent] = useState(account.ratePercent === null ? "" : String(account.ratePercent));
  const [rateValidFrom, setRateValidFrom] = useState(account.rateValidFrom ?? todayKey());
  const [rateValidTo, setRateValidTo] = useState(account.rateValidTo ?? "");
  const [rateCapitalizationPeriod, setRateCapitalizationPeriod] = useState(account.rateCapitalizationPeriod ?? "");
  const [rateNotes, setRateNotes] = useState(account.rateNotes ?? "");
  const [creditFacilityEnabled, setCreditFacilityEnabled] = useState(
    Boolean(account.creditFacilityId || account.direction === "LIABILITY" || account.direction === "RECEIVABLE"),
  );
  const [facilityType, setFacilityType] = useState(
    account.facilityType ??
      (account.accountType === "MORTGAGE"
        ? "MORTGAGE"
        : account.accountType === "PRIVATE_LOAN"
          ? "PRIVATE_LOAN"
          : "OTHER"),
  );
  const [facilityDirection, setFacilityDirection] = useState(
    account.facilityDirection ?? (account.direction === "RECEIVABLE" ? "LENT" : "BORROWED"),
  );
  const [principalAmount, setPrincipalAmount] = useState(
    account.principalAmount === null ? "" : String(account.principalAmount),
  );
  const [currentPrincipal, setCurrentPrincipal] = useState(
    account.currentPrincipal === null ? "" : String(account.currentPrincipal),
  );
  const [monthlyPayment, setMonthlyPayment] = useState(
    account.monthlyPayment === null ? "" : String(account.monthlyPayment),
  );
  const [paymentDay, setPaymentDay] = useState(account.paymentDay === null ? "" : String(account.paymentDay));
  const [facilityStartDate, setFacilityStartDate] = useState(account.facilityStartDate ?? "");
  const [targetEndDate, setTargetEndDate] = useState(account.targetEndDate ?? "");
  const [gracePeriodDays, setGracePeriodDays] = useState(
    account.gracePeriodDays === null ? "" : String(account.gracePeriodDays),
  );
  const [interestRatePercent, setInterestRatePercent] = useState(
    account.interestRatePercent === null ? "" : String(account.interestRatePercent),
  );
  const [facilityNotes, setFacilityNotes] = useState(account.facilityNotes ?? "");
  const [notes, setNotes] = useState(action === "edit" ? (account.notes ?? "") : "");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus(null);

    const payload = {
      name,
      accountType,
      direction,
      currency,
      partnerName,
      partnerRole,
      partnerKind,
      partnerLegalName,
      partnerWebsite,
      partnerNotes,
      openingDate,
      targetCloseDate,
      accountNumberMask,
      ibanMask,
      creditLimit,
      includeInNetWorth,
      notes,
      rateType,
      ratePercent,
      rateValidFrom,
      rateValidTo,
      rateCapitalizationPeriod,
      rateNotes,
      creditFacilityEnabled,
      facilityType,
      facilityDirection,
      principalAmount,
      currentPrincipal,
      monthlyPayment,
      paymentDay,
      facilityStartDate,
      targetEndDate,
      gracePeriodDays,
      interestRatePercent,
      facilityNotes,
    };

    try {
      const response = await fetch(`/api/banking/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Could not save account changes.");
      }

      router.refresh();
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save account changes.");
    } finally {
      setIsSaving(false);
    }
  }

  if (action === "balance") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/55 p-2 backdrop-blur-sm sm:p-4">
        <section className="max-h-[calc(100dvh-1rem)] w-full max-w-3xl overflow-y-auto rounded-lg border border-white/10 bg-panel p-3 text-left shadow-panel sm:max-h-[calc(100dvh-2rem)] sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{account.partnerName}</p>
              <h2 className="truncate text-base font-semibold text-slate-50">Balance snapshots</h2>
            </div>
            <button
              type="button"
              aria-label="Close account action"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-slate-50"
            >
              <X size={15} />
            </button>
          </div>
          <div className="mt-4">
            <BalanceManager account={account} onClose={onClose} />
          </div>
        </section>
      </div>
    );
  }

  if (action === "transaction") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/55 p-2 backdrop-blur-sm sm:p-4">
        <section className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-panel p-3 text-left shadow-panel sm:max-h-[calc(100dvh-2rem)] sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{account.name}</p>
              <h2 className="truncate text-base font-semibold text-slate-50">New transaction</h2>
            </div>
            <button
              type="button"
              aria-label="Close account transaction"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-slate-50"
            >
              <X size={15} />
            </button>
          </div>
          <div className="mt-4">
            <AccountTransactionManager account={account} onClose={onClose} />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/55 p-2 backdrop-blur-sm sm:p-4">
      <form
        onSubmit={submitForm}
        className="max-h-[calc(100dvh-1rem)] w-full max-w-3xl overflow-y-auto rounded-lg border border-white/10 bg-panel p-3 text-left shadow-panel sm:max-h-[calc(100dvh-2rem)] sm:p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{account.partnerName}</p>
            <h2 className="truncate text-base font-semibold text-slate-50">
              Edit account
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close account action"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-slate-50"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <>
              <fieldset className="grid gap-3 rounded-md border border-white/10 p-3">
                <legend className="px-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">Account</legend>
                <label className="grid gap-1 text-xs text-slate-400">
                  Account name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={formInputClassName()}
                    required
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-xs text-slate-400">
                    Type
                    <select
                      value={accountType}
                      onChange={(event) => setAccountType(event.target.value)}
                      className={formInputClassName()}
                    >
                      {editableAccountTypes.map((type) => (
                        <option key={type} className="bg-background text-slate-100" value={type}>
                          {accountTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Direction
                    <select
                      value={direction}
                      onChange={(event) => setDirection(event.target.value as BankingAccount["direction"])}
                      className={formInputClassName()}
                    >
                      {editableDirections.map((item) => (
                        <option key={item} className="bg-background text-slate-100" value={item}>
                          {accountTypeLabel(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Currency
                    <input
                      value={currency}
                      onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                      className={formInputClassName()}
                      maxLength={3}
                      required
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs text-slate-400">
                    Opening date
                    <input
                      type="date"
                      value={openingDate}
                      onChange={(event) => setOpeningDate(event.target.value)}
                      className={formInputClassName()}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Target close
                    <input
                      type="date"
                      value={targetCloseDate}
                      onChange={(event) => setTargetCloseDate(event.target.value)}
                      className={formInputClassName()}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Account mask
                    <input
                      value={accountNumberMask}
                      onChange={(event) => setAccountNumberMask(event.target.value)}
                      className={formInputClassName()}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    IBAN mask
                    <input
                      value={ibanMask}
                      onChange={(event) => setIbanMask(event.target.value)}
                      className={formInputClassName()}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Credit limit
                    <input
                      value={creditLimit}
                      onChange={(event) => setCreditLimit(event.target.value)}
                      className={formInputClassName()}
                      inputMode="decimal"
                    />
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-white/10 bg-background/60 px-2 py-2 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={includeInNetWorth}
                      onChange={(event) => setIncludeInNetWorth(event.target.checked)}
                      className="h-3 w-3 rounded border-white/20 bg-panel text-neutral focus:ring-neutral/40"
                    />
                    Include in net worth
                  </label>
                </div>
              </fieldset>

              <fieldset className="grid gap-3 rounded-md border border-white/10 p-3">
                <legend className="px-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">Partner</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-xs text-slate-400 sm:col-span-2">
                    Display name
                    <input
                      value={partnerName}
                      onChange={(event) => setPartnerName(event.target.value)}
                      className={formInputClassName()}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Role
                    <select
                      value={partnerRole}
                      onChange={(event) => setPartnerRole(event.target.value)}
                      className={formInputClassName()}
                    >
                      {editablePartnerRoles.map((role) => (
                        <option key={role} className="bg-background text-slate-100" value={role}>
                          {accountTypeLabel(role)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Kind
                    <select
                      value={partnerKind}
                      onChange={(event) => setPartnerKind(event.target.value)}
                      className={formInputClassName()}
                    >
                      {editablePartnerKinds.map((kind) => (
                        <option key={kind} className="bg-background text-slate-100" value={kind}>
                          {accountTypeLabel(kind)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Legal name
                    <input
                      value={partnerLegalName}
                      onChange={(event) => setPartnerLegalName(event.target.value)}
                      className={formInputClassName()}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Website
                    <input
                      value={partnerWebsite}
                      onChange={(event) => setPartnerWebsite(event.target.value)}
                      className={formInputClassName()}
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-xs text-slate-400">
                  Partner notes
                  <textarea
                    value={partnerNotes}
                    onChange={(event) => setPartnerNotes(event.target.value)}
                    className="min-h-16 rounded-md border border-white/10 bg-background p-2 text-xs text-slate-100 outline-none focus:border-neutral/60"
                  />
                </label>
              </fieldset>

              <fieldset className="grid gap-3 rounded-md border border-white/10 p-3">
                <legend className="px-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">Rate</legend>
                <div className="grid gap-3 sm:grid-cols-4">
                  <label className="grid gap-1 text-xs text-slate-400">
                    Annual rate %
                    <input
                      value={ratePercent}
                      onChange={(event) => setRatePercent(event.target.value)}
                      className={formInputClassName()}
                      inputMode="decimal"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Type
                    <select
                      value={rateType}
                      onChange={(event) => setRateType(event.target.value)}
                      className={formInputClassName()}
                    >
                      {editableRateTypes.map((type) => (
                        <option key={type} className="bg-background text-slate-100" value={type}>
                          {accountTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Valid from
                    <input
                      type="date"
                      value={rateValidFrom}
                      onChange={(event) => setRateValidFrom(event.target.value)}
                      className={formInputClassName()}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Valid to
                    <input
                      type="date"
                      value={rateValidTo}
                      onChange={(event) => setRateValidTo(event.target.value)}
                      className={formInputClassName()}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400 sm:col-span-2">
                    Capitalization
                    <select
                      value={rateCapitalizationPeriod}
                      onChange={(event) => setRateCapitalizationPeriod(event.target.value)}
                      className={formInputClassName()}
                    >
                      {editableCapitalizationPeriods.map((period) => (
                        <option key={period || "none"} className="bg-background text-slate-100" value={period}>
                          {period ? accountTypeLabel(period) : "None"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400 sm:col-span-2">
                    Rate notes
                    <input
                      value={rateNotes}
                      onChange={(event) => setRateNotes(event.target.value)}
                      className={formInputClassName()}
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="grid gap-3 rounded-md border border-white/10 p-3">
                <legend className="px-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">Credit facility</legend>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={creditFacilityEnabled}
                    onChange={(event) => setCreditFacilityEnabled(event.target.checked)}
                    className="h-3 w-3 rounded border-white/20 bg-panel text-neutral focus:ring-neutral/40"
                  />
                  Track credit facility
                </label>
                {creditFacilityEnabled ? (
                  <div className="grid gap-3 sm:grid-cols-4">
                    <label className="grid gap-1 text-xs text-slate-400">
                      Facility type
                      <select
                        value={facilityType}
                        onChange={(event) => setFacilityType(event.target.value)}
                        className={formInputClassName()}
                      >
                        {editableFacilityTypes.map((type) => (
                          <option key={type} className="bg-background text-slate-100" value={type}>
                            {accountTypeLabel(type)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs text-slate-400">
                      Direction
                      <select
                        value={facilityDirection}
                        onChange={(event) => setFacilityDirection(event.target.value)}
                        className={formInputClassName()}
                      >
                        {editableFacilityDirections.map((item) => (
                          <option key={item} className="bg-background text-slate-100" value={item}>
                            {accountTypeLabel(item)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs text-slate-400">
                      Principal
                      <input
                        value={principalAmount}
                        onChange={(event) => setPrincipalAmount(event.target.value)}
                        className={formInputClassName()}
                        inputMode="decimal"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-slate-400">
                      Current principal
                      <input
                        value={currentPrincipal}
                        onChange={(event) => setCurrentPrincipal(event.target.value)}
                        className={formInputClassName()}
                        inputMode="decimal"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-slate-400">
                      Monthly payment
                      <input
                        value={monthlyPayment}
                        onChange={(event) => setMonthlyPayment(event.target.value)}
                        className={formInputClassName()}
                        inputMode="decimal"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-slate-400">
                      Payment day
                      <input
                        value={paymentDay}
                        onChange={(event) => setPaymentDay(event.target.value)}
                        className={formInputClassName()}
                        inputMode="numeric"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-slate-400">
                      Start date
                      <input
                        type="date"
                        value={facilityStartDate}
                        onChange={(event) => setFacilityStartDate(event.target.value)}
                        className={formInputClassName()}
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-slate-400">
                      Target end
                      <input
                        type="date"
                        value={targetEndDate}
                        onChange={(event) => setTargetEndDate(event.target.value)}
                        className={formInputClassName()}
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-slate-400">
                      Grace days
                      <input
                        value={gracePeriodDays}
                        onChange={(event) => setGracePeriodDays(event.target.value)}
                        className={formInputClassName()}
                        inputMode="numeric"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-slate-400">
                      Interest %
                      <input
                        value={interestRatePercent}
                        onChange={(event) => setInterestRatePercent(event.target.value)}
                        className={formInputClassName()}
                        inputMode="decimal"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-slate-400 sm:col-span-2">
                      Facility notes
                      <input
                        value={facilityNotes}
                        onChange={(event) => setFacilityNotes(event.target.value)}
                        className={formInputClassName()}
                      />
                    </label>
                  </div>
                ) : null}
              </fieldset>
          </>

          {action === "edit" ? (
            <>
              <label className="grid gap-1 text-xs text-slate-400">
                Account notes
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-20 rounded-md border border-white/10 bg-background p-2 text-xs text-slate-100 outline-none focus:border-neutral/60"
                />
              </label>
              {status ? <p className="rounded-md bg-negative/10 px-3 py-2 text-xs text-negative">{status}</p> : null}
            </>
          ) : null}
        </div>

        {action === "edit" ? <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-white/10 px-3 text-xs font-medium text-slate-300 hover:border-neutral/50 hover:text-slate-50"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex h-9 items-center gap-2 rounded-md bg-neutral px-3 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={14} />
            {isSaving ? "Saving" : "Save"}
          </button>
        </div> : null}
      </form>
    </div>
  );
}

function AccountActions({
  account,
  chartRange,
  openMenuAccountId,
  onOpenMenuChange,
}: {
  account: BankingAccount;
  chartRange: AccountChartRange;
  openMenuAccountId: string | null;
  onOpenMenuChange: (accountId: string | null) => void;
}) {
  const router = useRouter();
  const isMenuOpen = openMenuAccountId === account.id;
  const [menuDirection, setMenuDirection] = useState<MenuDirection>("down");
  const [modalAction, setModalAction] = useState<ModalAccountAction | null>(null);
  const [isChartOpen, setIsChartOpen] = useState(false);
  const [chartWindowZIndex, setChartWindowZIndex] = useState(nextFloatingAccountChartZIndex);
  const [status, setStatus] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function focusChartWindow() {
    nextFloatingAccountChartZIndex += 1;
    setChartWindowZIndex(nextFloatingAccountChartZIndex);
  }

  function updateMenuDirection() {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const tableBody = trigger.closest("tbody");
    const tableBodyRect = tableBody?.getBoundingClientRect();
    const menuHeight = accountActionItems.length * 32 + 8;
    const viewportPadding = 12;
    const lowerBoundary = Math.min(window.innerHeight - viewportPadding, tableBodyRect?.bottom ?? window.innerHeight);
    const upperBoundary = Math.max(viewportPadding, tableBodyRect?.top ?? viewportPadding);
    const spaceBelow = lowerBoundary - rect.bottom;
    const spaceAbove = rect.top - upperBoundary;

    setMenuDirection(spaceBelow < menuHeight && spaceAbove > spaceBelow ? "up" : "down");
  }

  function toggleMenu() {
    if (isMenuOpen) {
      onOpenMenuChange(null);
      return;
    }

    setStatus(null);
    updateMenuDirection();
    onOpenMenuChange(account.id);
  }

  async function deleteAccount() {
    onOpenMenuChange(null);

    if (!window.confirm("Are you sure?")) {
      return;
    }

    setStatus(null);

    try {
      const response = await fetch(`/api/banking/accounts/${account.id}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Could not delete account.");
      }

      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete account.");
    }
  }

  function openAction(action: AccountAction) {
    onOpenMenuChange(null);

    if (action === "delete") {
      void deleteAccount();
      return;
    }

    if (action === "chart") {
      setIsChartOpen(true);
      focusChartWindow();
      return;
    }

    setModalAction(action);
  }

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    updateMenuDirection();
    window.addEventListener("resize", updateMenuDirection);
    window.addEventListener("scroll", updateMenuDirection, true);

    return () => {
      window.removeEventListener("resize", updateMenuDirection);
      window.removeEventListener("scroll", updateMenuDirection, true);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function closeOnOutsidePointer(event: MouseEvent | TouchEvent) {
      const root = rootRef.current;
      const target = event.target;

      if (root && target instanceof Node && root.contains(target)) {
        return;
      }

      onOpenMenuChange(null);
    }

    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("touchstart", closeOnOutsidePointer);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePointer);
      document.removeEventListener("touchstart", closeOnOutsidePointer);
    };
  }, [isMenuOpen, onOpenMenuChange]);

  return (
    <div ref={rootRef} className="relative flex shrink-0 justify-start">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${account.name} actions`}
        onClick={toggleMenu}
        className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:border-neutral/50 hover:text-slate-50"
      >
        <MoreHorizontal size={14} />
      </button>

      {isMenuOpen ? (
        <div
          className={cn(
            "absolute left-0 z-[1000] w-44 rounded-lg border border-white/10 bg-panel p-1 shadow-panel",
            menuDirection === "up" ? "bottom-7" : "top-7",
          )}
        >
          {accountActionItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openAction(item.id)}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-surface",
                item.id === "delete" ? "text-negative hover:text-red-200" : "text-slate-300 hover:text-slate-50",
              )}
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {modalAction ? (
        <AccountActionDialog account={account} action={modalAction} onClose={() => setModalAction(null)} />
      ) : null}

      {isChartOpen ? (
        <FloatingAccountChartWindow
          account={account}
          initialRange={chartRange}
          zIndex={chartWindowZIndex}
          onClose={() => setIsChartOpen(false)}
          onFocus={focusChartWindow}
        />
      ) : null}

      {status ? (
        <div className="absolute left-0 top-8 z-[1000] w-56 rounded-md border border-negative/30 bg-panel p-2 text-[11px] text-negative shadow-panel">
          {status}
        </div>
      ) : null}
    </div>
  );
}

function AccountRow({
  account,
  baseCurrency,
  chartRange,
  openMenuAccountId,
  onOpenMenuChange,
}: {
  account: BankingAccount;
  baseCurrency: string;
  chartRange: AccountChartRange;
  openMenuAccountId: string | null;
  onOpenMenuChange: (accountId: string | null) => void;
}) {
  const isLiability = account.direction === "LIABILITY";
  const signedValue = accountValue(account);

  return (
    <tr className="text-slate-200">
      <td className="border-b border-white/5 py-1.5 pr-3">
        <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
          <AccountActions
            account={account}
            chartRange={chartRange}
            openMenuAccountId={openMenuAccountId}
            onOpenMenuChange={onOpenMenuChange}
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-100">{account.name}</p>
            <p className="truncate text-[11px] text-slate-500">{account.partnerName}</p>
          </div>
        </div>
      </td>
      <td className="border-b border-white/5 px-3 py-1.5 text-slate-400">{accountTypeLabel(account.accountType)}</td>
      <td className="border-b border-white/5 px-3 py-1.5 text-slate-400">
        {isLiquidAccount(account) ? "Liquid" : "Long term"}
      </td>
      <td
        className={cn(
          "border-b border-white/5 px-3 py-1.5 text-right font-mono tabular",
          signedValue >= 0 ? "text-positive" : "text-negative",
        )}
      >
        {signedValue >= 0 ? "+" : "-"}
        {formatCurrencyAmount(Math.abs(signedValue), account.currency)}
      </td>
      <td className="border-b border-white/5 py-1.5 pl-3 text-right">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
            isLiability ? "bg-negative/10 text-negative" : "bg-positive/10 text-positive",
          )}
        >
          {isLiability ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
          {isLiability ? "debit" : "credit"}
        </span>
        <p className="mt-0.5 font-mono text-[10px] text-slate-500">
          {formatCurrencyNumber(Math.abs(signedValue))} {baseCurrency}
        </p>
      </td>
    </tr>
  );
}

function TimelineEvent({ event }: { event: BankingTimelineEvent }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_94px] items-center gap-2 rounded-md bg-background/70 px-2 py-1.5 text-[11px]">
      <span className="font-mono tabular text-slate-500">{event.date.slice(5)}</span>
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-200">{event.label}</p>
      </div>
      <span className={cn("text-right font-mono tabular", event.tone === "negative" ? "text-negative" : "text-positive")}>
        {event.tone === "negative" ? "-" : "+"}
        {formatCurrencyAmount(event.amount, event.currency)}
      </span>
    </div>
  );
}

function timelineTick(value: string) {
  const date = new Date(`${value}T00:00:00Z`);

  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function buildCurrencyAxis(values: number[]) {
  const validValues = values.filter((value) => Number.isFinite(value));

  if (validValues.length === 0) {
    return [0, 100_000] as [number, number];
  }

  const minimum = Math.min(...validValues);
  const maximum = Math.max(...validValues);
  const padding = Math.max((maximum - minimum) * 0.12, Math.max(Math.abs(maximum), 1) * 0.03, 10_000);

  return [minimum - padding, maximum + padding] as [number, number];
}

export function BankingWorkspace({ data }: { data: BankingData }) {
  const [openMenuAccountId, setOpenMenuAccountId] = useState<string | null>(null);
  const [visibleFilters, setVisibleFilters] = useState<Record<BankingAccountFilter, boolean>>({
    credits: true,
    debits: true,
    liquid: true,
    longTerm: true,
  });
  const [bankingTimelineRange, setBankingTimelineRange] = useState<AccountChartRange>("1Y");
  const highLiquidityCash = useMemo(
    () =>
      data.accounts
        .filter((account) => isLiquidAccount(account))
        .reduce((sum, account) => sum + account.balance, 0),
    [data.accounts],
  );
  const longTermBalance = useMemo(
    () =>
      data.accounts
        .filter((account) => account.direction !== "LIABILITY" && !isLiquidAccount(account))
        .reduce((sum, account) => sum + account.balance, 0),
    [data.accounts],
  );
  const overallBalance = highLiquidityCash + longTermBalance - data.metrics.liabilities;
  const bankingTimelineWindow = useMemo(() => centeredChartWindow(bankingTimelineRange), [bankingTimelineRange]);
  const bankingTimelineData = useMemo(
    () => {
      const points = bankingTimelineWindow
        ? data.balanceSeries.filter(
            (point) => point.date >= bankingTimelineWindow.startDate && point.date <= bankingTimelineWindow.endDate,
          )
        : data.balanceSeries;

      return points.map((point) => ({
        ...point,
        timestamp: dateToTimestamp(point.date),
      }));
    },
    [bankingTimelineWindow, data.balanceSeries],
  );
  const chartDomain = useMemo(() => buildCurrencyAxis(bankingTimelineData.map((point) => point.value)), [bankingTimelineData]);
  const todayTime = bankingTimelineWindow?.todayTime ?? dateToTimestamp(todayKey());
  const bankingTimelineEventMarkers = useMemo(() => {
    const [minimum, maximum] = chartDomain;
    const markerY = minimum + (maximum - minimum) * 0.06;
    const events = bankingTimelineWindow
      ? data.timeline.filter((event) => event.date >= bankingTimelineWindow.startDate && event.date <= bankingTimelineWindow.endDate)
      : data.timeline;

    return events.map((event) => ({
      ...event,
      timestamp: dateToTimestamp(event.date),
      y: markerY,
    }));
  }, [bankingTimelineWindow, chartDomain, data.timeline]);
  const visibleAccounts = useMemo(
    () =>
      data.accounts.filter((account) => {
        const directionVisible = isCreditAccount(account) ? visibleFilters.credits : visibleFilters.debits;
        const liquidityVisible = isLiquidAccount(account) ? visibleFilters.liquid : visibleFilters.longTerm;

        return directionVisible && liquidityVisible;
      }),
    [data.accounts, visibleFilters],
  );

  function toggleFilter(filter: BankingAccountFilter, checked: boolean) {
    setVisibleFilters((current) => ({
      ...current,
      [filter]: checked,
    }));
  }

  return (
    <section className="grid gap-3 py-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">Overall balance</p>
              <p className={cn("mt-1 font-mono text-xl font-semibold tabular", valueTone(overallBalance))}>
                {formatCurrencyAmount(overallBalance, data.baseCurrency)}
              </p>
            </div>
            <span className={cn("rounded-md p-2", cardTone(overallBalance >= 0 ? "green" : "red"))}>
              {overallBalance >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
            </span>
          </div>
          <p className="mt-2 w-fit rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-slate-400">
            assets minus debts
          </p>
        </article>

        <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">Available high liquidity cash</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular text-slate-50">
                {formatCurrencyAmount(highLiquidityCash, data.baseCurrency)}
              </p>
            </div>
            <span className={cn("rounded-md p-2", cardTone("green"))}>
              <WalletCards size={16} />
            </span>
          </div>
          <p className="mt-2 w-fit rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-medium text-positive">
            current accounts and wallets
          </p>
        </article>

        <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">Long term balance</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular text-slate-50">
                {formatCurrencyAmount(longTermBalance, data.baseCurrency)}
              </p>
            </div>
            <span className={cn("rounded-md p-2", cardTone("blue"))}>
              <Landmark size={16} />
            </span>
          </div>
          <p className="mt-2 w-fit rounded-full bg-neutral/10 px-2 py-0.5 text-[10px] font-medium text-blue-300">
            savings and receivables
          </p>
        </article>
      </div>

      <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Banking timeline</p>
              <h2 className="truncate text-sm font-semibold text-slate-50">Historical and projected balance</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <fieldset className="grid grid-cols-4 gap-1 rounded-md border border-white/10 bg-background/60 p-1">
                <legend className="sr-only">Banking timeline range</legend>
                {accountChartRanges.map((item) => (
                  <label
                    key={item.id}
                    className={cn(
                      "flex h-6 cursor-pointer items-center justify-center rounded px-1.5 text-[10px] font-medium",
                      bankingTimelineRange === item.id
                        ? "bg-neutral/20 text-blue-200"
                        : "text-slate-500 hover:text-slate-200",
                    )}
                  >
                    <input
                      type="radio"
                      name="banking-timeline-range"
                      value={item.id}
                      checked={bankingTimelineRange === item.id}
                      onChange={() => setBankingTimelineRange(item.id)}
                      className="sr-only"
                    />
                    {item.label}
                  </label>
                ))}
              </fieldset>
              <span className="w-fit rounded-full bg-surface px-2 py-1 text-[10px] text-slate-400">
                {data.balanceSeriesMeta.snapshotCount} snapshots · {data.balanceSeriesMeta.projectedMonths}M projection
              </span>
            </div>
          </div>
          <div className="h-64 min-h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bankingTimelineData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="bankingBalance" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.55} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={bankingTimelineWindow ? [bankingTimelineWindow.startTime, bankingTimelineWindow.endTime] : ["dataMin", "dataMax"]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#94A3B8", fontSize: 11 }}
                  minTickGap={14}
                  tickFormatter={(value: number) => timelineTick(timestampToDateKey(value))}
                />
                <YAxis
                  width={112}
                  domain={chartDomain}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#94A3B8", fontSize: 9 }}
                  tickFormatter={(value: number) => formatCurrencyAmount(value, data.baseCurrency)}
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
                  formatter={(value: number) => [formatCurrencyAmount(value, data.baseCurrency), "Balance"]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
                />
                <ReferenceLine x={todayTime} stroke="rgba(245,158,11,0.55)" strokeDasharray="4 4" ifOverflow="extendDomain" />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="url(#bankingBalance)"
                />
                {bankingTimelineEventMarkers.map((event) => (
                  <ReferenceDot
                    key={event.id}
                    x={event.timestamp}
                    y={event.y}
                    r={4}
                    fill="#151922"
                    stroke={eventMarkerStroke(event.tone)}
                    strokeWidth={2}
                    ifOverflow="extendDomain"
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full border-2 border-negative bg-panel" />
              Scheduled debit
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full border-2 border-positive bg-panel" />
              Scheduled credit
            </span>
            <span>{bankingTimelineEventMarkers.length} events in range</span>
          </div>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {data.timeline.length > 0 ? (
              data.timeline.map((event) => <TimelineEvent key={event.id} event={event} />)
            ) : (
              <div className="rounded-md border border-white/10 bg-background/70 px-3 py-6 text-xs text-slate-500">
                No scheduled banking events yet.
              </div>
            )}
          </div>
        </div>
      </article>

      <article className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-50">Accounts</h2>
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-white/10 bg-background/60 p-1">
              {accountFilters.map((filter) => (
                <label
                  key={filter.id}
                  className="flex h-6 cursor-pointer items-center gap-1 rounded px-2 text-[10px] font-medium text-slate-400 hover:text-slate-100"
                >
                  <input
                    type="checkbox"
                    checked={visibleFilters[filter.id]}
                    onChange={(event) => toggleFilter(filter.id, event.target.checked)}
                    className="h-3 w-3 rounded border-white/20 bg-panel text-neutral focus:ring-neutral/40"
                  />
                  {filter.label}
                </label>
              ))}
            </div>
          </div>
          <span className="text-xs text-slate-500">
            {visibleAccounts.length} accounts · {data.baseCurrency}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="border-b border-white/10 pb-2 font-medium">Account</th>
                <th className="border-b border-white/10 px-3 pb-2 font-medium">Type</th>
                <th className="border-b border-white/10 px-3 pb-2 font-medium">Bucket</th>
                <th className="border-b border-white/10 px-3 pb-2 text-right font-medium">Balance</th>
                <th className="border-b border-white/10 pb-2 pl-3 text-right font-medium">Signal</th>
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  baseCurrency={data.baseCurrency}
                  chartRange={bankingTimelineRange}
                  openMenuAccountId={openMenuAccountId}
                  onOpenMenuChange={setOpenMenuAccountId}
                />
              ))}
            </tbody>
          </table>
          {visibleAccounts.length === 0 ? (
            <div className="rounded-md border border-white/10 bg-background/70 px-3 py-6 text-xs text-slate-500">
              No accounts match the current filters.
            </div>
          ) : null}
        </div>
      </article>
    </section>
  );
}
