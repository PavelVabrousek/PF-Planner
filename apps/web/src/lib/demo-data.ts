import {
  Activity,
  BarChart3,
  CircleDollarSign,
  Home,
  Landmark,
  Layers3,
  LineChart,
  MoreHorizontal,
  PieChart,
  ReceiptText,
  Target,
  WalletCards,
} from "lucide-react";

export type Holding = {
  symbol: string;
  name: string;
  type: "STOCK" | "ETF" | "CRYPTO";
  broker: string;
  currency: "USD" | "EUR" | "CZK" | "CHF" | "DKK" | "PLN" | "GBP";
  latestPrice: number | null;
  valueCzk: number;
  allocation: number;
  dayChange: number;
  totalReturn: number;
};

export const portfolioSeries = [
  { month: "Jan", value: 1680000 },
  { month: "Feb", value: 1714000 },
  { month: "Mar", value: 1698000 },
  { month: "Apr", value: 1762000 },
  { month: "May", value: 1836000 },
  { month: "Jun", value: 1889000 },
  { month: "Jul", value: 1924000 },
  { month: "Aug", value: 1988000 },
  { month: "Sep", value: 1969000 },
  { month: "Oct", value: 2042000 },
  { month: "Nov", value: 2115000 },
  { month: "Dec", value: 2187400 },
];

export const allocation = [
  { name: "ETFs", value: 46, fill: "#3B82F6" },
  { name: "Stocks", value: 34, fill: "#22C55E" },
  { name: "Crypto", value: 12, fill: "#F59E0B" },
  { name: "Cash", value: 8, fill: "#94A3B8" },
];

export const holdings: Holding[] = [
  {
    symbol: "VWCE",
    name: "Vanguard FTSE All-World",
    type: "ETF",
    broker: "XETRA",
    currency: "EUR",
    latestPrice: 128.2,
    valueCzk: 742250,
    allocation: 33.9,
    dayChange: 0.42,
    totalReturn: 18.7,
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    type: "STOCK",
    broker: "NASDAQ",
    currency: "USD",
    latestPrice: 204.6,
    valueCzk: 286900,
    allocation: 13.1,
    dayChange: -0.18,
    totalReturn: 26.4,
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    type: "CRYPTO",
    broker: "CRYPTO",
    currency: "USD",
    latestPrice: 92410,
    valueCzk: 263700,
    allocation: 12.1,
    dayChange: 1.36,
    totalReturn: 41.8,
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    type: "STOCK",
    broker: "NASDAQ",
    currency: "USD",
    latestPrice: 428.8,
    valueCzk: 222480,
    allocation: 10.2,
    dayChange: 0.27,
    totalReturn: 21.9,
  },
  {
    symbol: "CASH",
    name: "Broker cash",
    type: "ETF",
    broker: "MANUAL",
    currency: "CZK",
    latestPrice: 1,
    valueCzk: 174070,
    allocation: 8,
    dayChange: 0,
    totalReturn: 0,
  },
];

export const transactions = [
  { type: "BUY", symbol: "VWCE", date: "2026-05-08", amount: -28540, currency: "CZK" },
  { type: "DIVIDEND", symbol: "AAPL", date: "2026-05-03", amount: 612, currency: "CZK" },
  { type: "FEE", symbol: "Broker", date: "2026-04-30", amount: -79, currency: "CZK" },
  { type: "BUY", symbol: "BTC", date: "2026-04-27", amount: -12000, currency: "CZK" },
];

export const watchlist = [
  { symbol: "SPY", price: "532.14 USD", change: 0.31 },
  { symbol: "EURCZK", price: "24.86 CZK", change: -0.08 },
  { symbol: "BTC", price: "92,410.00 USD", change: 1.36 },
];

export const navItems = [
  { label: "Home", icon: Home, active: true },
  { label: "Assets", icon: Layers3, active: false },
  { label: "Cash Flow", icon: WalletCards, active: false },
  { label: "Plan", icon: Target, active: false },
  { label: "Reports", icon: BarChart3, active: false },
  { label: "More", icon: MoreHorizontal, active: false },
];

export const metrics = [
  {
    label: "Net worth",
    value: "2,187,400.00 CZK",
    delta: "+4.80% MTD",
    tone: "positive",
    icon: Landmark,
  },
  {
    label: "Portfolio P/L",
    value: "+312,400.00 CZK",
    delta: "+16.70% total",
    tone: "positive",
    icon: LineChart,
  },
  {
    label: "Dividends YTD",
    value: "18,600.00 CZK",
    delta: "after tax",
    tone: "neutral",
    icon: CircleDollarSign,
  },
  {
    label: "Import status",
    value: "42 rows",
    delta: "3 need review",
    tone: "warning",
    icon: ReceiptText,
  },
];

export const workQueue = [
  { label: "Paste import preview", detail: "Google Sheets parser ready", icon: ReceiptText },
  { label: "Daily price sync", detail: "Stale by 1 market day", icon: Activity },
  { label: "Allocation drift", detail: "Crypto is 2.10% above target", icon: PieChart },
];
