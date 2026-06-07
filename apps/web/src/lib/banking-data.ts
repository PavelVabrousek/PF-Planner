import type { CurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";

export type BankingAccount = {
  id: string;
  name: string;
  accountType: string;
  direction: "ASSET" | "LIABILITY" | "RECEIVABLE";
  currency: string;
  balance: number;
  partnerName: string;
  partnerRole: string;
  ratePercent: number | null;
  monthlyPayment: number | null;
  targetEndDate: string | null;
};

export type BankingTimelineEvent = {
  id: string;
  date: string;
  label: string;
  amount: number;
  currency: string;
  tone: "positive" | "negative" | "neutral" | "warning";
};

export type BankingData = {
  baseCurrency: string;
  accounts: BankingAccount[];
  savingsAccounts: BankingAccount[];
  debtAccounts: BankingAccount[];
  receivableAccounts: BankingAccount[];
  timeline: BankingTimelineEvent[];
  metrics: {
    liquidAssets: number;
    liabilities: number;
    receivables: number;
    netPosition: number;
    monthlyCommitted: number;
    monthlyInterestIncome: number;
    runwayMonths: number | null;
  };
};

type AccountRow = {
  id: string;
  name: string;
  account_type: string;
  direction: "ASSET" | "LIABILITY" | "RECEIVABLE";
  currency: string;
  balance: string | number | null;
  partner_name: string | null;
  partner_role: string | null;
  rate_percent: string | number | null;
  monthly_payment: string | number | null;
  target_end_date: string | null;
  payment_day: number | null;
};

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function nextPaymentDate(paymentDay: number | null) {
  const today = new Date();
  const day = Math.min(Math.max(paymentDay ?? 15, 1), 28);
  const candidate = new Date(today.getFullYear(), today.getMonth(), day);

  if (candidate < today) {
    candidate.setMonth(candidate.getMonth() + 1);
  }

  return dateKey(candidate);
}

function nextMonthStart() {
  const today = new Date();
  return dateKey(new Date(today.getFullYear(), today.getMonth() + 1, 1));
}

function dateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function byDate(left: BankingTimelineEvent, right: BankingTimelineEvent) {
  return left.date.localeCompare(right.date) || left.label.localeCompare(right.label);
}

export async function getBankingData(user: CurrentPfpUser): Promise<BankingData> {
  const pool = createPostgresPool();

  if (!pool) {
    throw new Error("Missing database connection.");
  }

  const result = await pool.query<AccountRow>(
    `
    select
      fa.id,
      fa.name,
      fa.account_type,
      fa.direction,
      fa.currency::text as currency,
      coalesce(latest_balance.balance, 0) as balance,
      p.display_name as partner_name,
      pr.role as partner_role,
      active_rate.annual_rate_percent as rate_percent,
      cf.monthly_payment,
      cf.target_end_date::text as target_end_date,
      cf.payment_day
    from public.financial_accounts fa
    left join public.partner_roles pr on pr.id = fa.provider_partner_role_id
    left join public.partners p on p.id = pr.partner_id
    left join lateral (
      select abs.balance
      from public.account_balance_snapshots abs
      where abs.account_id = fa.id
      order by abs.balance_date desc, abs.created_at desc
      limit 1
    ) latest_balance on true
    left join lateral (
      select arp.annual_rate_percent
      from public.account_rate_periods arp
      where arp.account_id = fa.id
        and arp.valid_from <= current_date
        and (arp.valid_to is null or arp.valid_to >= current_date)
      order by arp.valid_from desc
      limit 1
    ) active_rate on true
    left join public.credit_facilities cf on cf.account_id = fa.id
    where fa.user_id = $1::uuid
      and fa.is_active = true
    order by
      case fa.direction when 'ASSET' then 0 when 'RECEIVABLE' then 1 else 2 end,
      fa.account_type,
      fa.name
    `,
    [user.dataUserId],
  );

  const accounts = result.rows.map((row): BankingAccount => ({
    id: row.id,
    name: row.name,
    accountType: row.account_type,
    direction: row.direction,
    currency: row.currency,
    balance: toNumber(row.balance),
    partnerName: row.partner_name ?? "Manual partner",
    partnerRole: row.partner_role ?? "OTHER",
    ratePercent: row.rate_percent === null ? null : toNumber(row.rate_percent),
    monthlyPayment: row.monthly_payment === null ? null : toNumber(row.monthly_payment),
    targetEndDate: row.target_end_date,
  }));

  const savingsAccounts = accounts.filter((account) => account.accountType === "SAVINGS");
  const debtAccounts = accounts.filter((account) => account.direction === "LIABILITY");
  const receivableAccounts = accounts.filter((account) => account.direction === "RECEIVABLE");
  const liquidAssets = accounts
    .filter((account) => account.direction === "ASSET")
    .reduce((sum, account) => sum + account.balance, 0);
  const liabilities = debtAccounts.reduce((sum, account) => sum + account.balance, 0);
  const receivables = receivableAccounts.reduce((sum, account) => sum + account.balance, 0);
  const monthlyCommitted = debtAccounts.reduce((sum, account) => sum + (account.monthlyPayment ?? 0), 0);
  const monthlyInterestIncome = savingsAccounts.reduce(
    (sum, account) => sum + account.balance * ((account.ratePercent ?? 0) / 100 / 12),
    0,
  );

  const debtEvents = debtAccounts
    .filter((account) => (account.monthlyPayment ?? 0) > 0)
    .map((account): BankingTimelineEvent => ({
      id: `debt-${account.id}`,
      date: nextPaymentDate(15),
      label: `${account.name} payment`,
      amount: account.monthlyPayment ?? 0,
      currency: account.currency,
      tone: "negative",
    }));

  const savingsEvents = savingsAccounts.map((account): BankingTimelineEvent => ({
    id: `rate-${account.id}`,
    date: nextMonthStart(),
    label: `${account.partnerName} rate review`,
    amount: Math.round(account.balance * ((account.ratePercent ?? 0) / 100 / 12)),
    currency: account.currency,
    tone: "positive",
  }));

  return {
    baseCurrency: "CZK",
    accounts,
    savingsAccounts,
    debtAccounts,
    receivableAccounts,
    timeline: [...debtEvents, ...savingsEvents].sort(byDate),
    metrics: {
      liquidAssets,
      liabilities,
      receivables,
      netPosition: liquidAssets + receivables - liabilities,
      monthlyCommitted,
      monthlyInterestIncome,
      runwayMonths: monthlyCommitted > 0 ? liquidAssets / monthlyCommitted : null,
    },
  };
}
