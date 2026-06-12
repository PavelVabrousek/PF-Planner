import type { CurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";

export type BankingAccount = {
  id: string;
  name: string;
  accountType: string;
  direction: "ASSET" | "LIABILITY" | "RECEIVABLE";
  currency: string;
  balance: number;
  providerPartnerRoleId: string | null;
  partnerId: string | null;
  partnerName: string;
  partnerRole: string;
  partnerKind: string;
  partnerLegalName: string | null;
  partnerWebsite: string | null;
  partnerNotes: string | null;
  openingDate: string | null;
  targetCloseDate: string | null;
  accountNumberMask: string | null;
  ibanMask: string | null;
  creditLimit: number | null;
  includeInNetWorth: boolean;
  notes: string | null;
  ratePeriodId: string | null;
  rateType: string | null;
  ratePercent: number | null;
  rateValidFrom: string | null;
  rateValidTo: string | null;
  rateCapitalizationPeriod: string | null;
  rateNotes: string | null;
  creditFacilityId: string | null;
  counterpartyPartnerRoleId: string | null;
  facilityDirection: string | null;
  monthlyPayment: number | null;
  paymentDay: number | null;
  facilityType: string | null;
  principalAmount: number | null;
  currentPrincipal: number | null;
  interestRatePercent: number | null;
  facilityStartDate: string | null;
  targetEndDate: string | null;
  gracePeriodDays: number | null;
  facilityNotes: string | null;
  balanceSnapshots: BankingBalanceSnapshot[];
  balanceSeries: BankingBalancePoint[];
};

export type BankingBalanceSnapshot = {
  id: string;
  balanceDate: string;
  balance: number;
  currency: string;
  source: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BankingBalancePoint = {
  date: string;
  label: string;
  value: number;
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
  balanceSeries: BankingBalancePoint[];
  balanceSeriesMeta: {
    snapshotCount: number;
    historicalMonths: number;
    projectedMonths: number;
  };
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
  provider_partner_role_id: string | null;
  partner_id: string | null;
  partner_name: string | null;
  partner_role: string | null;
  partner_kind: string | null;
  partner_legal_name: string | null;
  partner_website: string | null;
  partner_notes: string | null;
  opening_date: string | null;
  target_close_date: string | null;
  account_number_mask: string | null;
  iban_mask: string | null;
  credit_limit: string | number | null;
  include_in_net_worth: boolean;
  account_notes: string | null;
  rate_period_id: string | null;
  rate_type: string | null;
  rate_percent: string | number | null;
  rate_valid_from: string | null;
  rate_valid_to: string | null;
  rate_capitalization_period: string | null;
  rate_notes: string | null;
  credit_facility_id: string | null;
  counterparty_partner_role_id: string | null;
  facility_direction: string | null;
  monthly_payment: string | number | null;
  payment_day: number | null;
  facility_type: string | null;
  principal_amount: string | number | null;
  current_principal: string | number | null;
  interest_rate_percent: string | number | null;
  facility_start_date: string | null;
  target_end_date: string | null;
  grace_period_days: number | null;
  facility_notes: string | null;
};

type SnapshotRow = {
  id: string;
  account_id: string;
  balance_date: string;
  balance: string | number;
  currency: string;
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type AccountSnapshot = {
  date: string;
  balance: number;
};

type AccountProjectionInput = Omit<BankingAccount, "balanceSeries" | "balanceSnapshots">;

const historicalMonths = 60;
const projectedMonths = 60;
const accountProjectedMonths = 120;

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

function addUtcMonths(date: Date, months: number) {
  const nextDate = new Date(date);
  nextDate.setUTCMonth(nextDate.getUTCMonth() + months);

  return nextDate;
}

function monthDistance(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const yearMonths = (end.getUTCFullYear() - start.getUTCFullYear()) * 12;

  return yearMonths + (end.getUTCMonth() - start.getUTCMonth()) + (end.getUTCDate() - start.getUTCDate()) / 30;
}

function seriesDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00Z`);

  return parsedDate.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
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

function signedBalance(account: AccountProjectionInput, balance: number) {
  return account.direction === "LIABILITY" ? -balance : balance;
}

function projectAssetBalance(balance: number, monthlyRate: number, months: number) {
  if (monthlyRate === 0) {
    return balance;
  }

  return balance * (1 + monthlyRate) ** months;
}

function projectLiabilityBalance(balance: number, monthlyRate: number, monthlyPayment: number, months: number) {
  const wholeMonths = Math.trunc(Math.abs(months));
  const partialMonth = Math.abs(months) - wholeMonths;
  let projectedBalance = balance;

  for (let index = 0; index < wholeMonths; index += 1) {
    if (months >= 0) {
      projectedBalance = Math.max(0, projectedBalance * (1 + monthlyRate) - monthlyPayment);
    } else {
      projectedBalance =
        monthlyRate === 0 ? projectedBalance + monthlyPayment : (projectedBalance + monthlyPayment) / (1 + monthlyRate);
    }
  }

  if (partialMonth > 0) {
    if (months >= 0) {
      projectedBalance = Math.max(0, projectedBalance * (1 + monthlyRate * partialMonth) - monthlyPayment * partialMonth);
    } else {
      projectedBalance =
        monthlyRate === 0
          ? projectedBalance + monthlyPayment * partialMonth
          : (projectedBalance + monthlyPayment * partialMonth) / (1 + monthlyRate * partialMonth);
    }
  }

  return projectedBalance;
}

function projectAccountBalance(account: AccountProjectionInput, anchorBalance: number, months: number) {
  const monthlyRate = Math.max(account.interestRatePercent ?? account.ratePercent ?? 0, 0) / 100 / 12;

  if (account.direction === "LIABILITY") {
    return projectLiabilityBalance(anchorBalance, monthlyRate, account.monthlyPayment ?? 0, months);
  }

  return projectAssetBalance(anchorBalance, monthlyRate, months);
}

function accountBalanceAt(account: AccountProjectionInput, snapshots: AccountSnapshot[], date: string) {
  if (snapshots.length === 0) {
    return projectAccountBalance(account, account.balance, monthDistance(dateKey(new Date()), date));
  }

  const previousSnapshot = snapshots.filter((snapshot) => snapshot.date <= date).at(-1);
  const nextSnapshot = snapshots.find((snapshot) => snapshot.date >= date);

  if (previousSnapshot && previousSnapshot.date === date) {
    return previousSnapshot.balance;
  }

  if (previousSnapshot && nextSnapshot && previousSnapshot.date !== nextSnapshot.date) {
    const totalMonths = monthDistance(previousSnapshot.date, nextSnapshot.date);
    const elapsedMonths = monthDistance(previousSnapshot.date, date);
    const progress = totalMonths === 0 ? 0 : elapsedMonths / totalMonths;

    return previousSnapshot.balance + (nextSnapshot.balance - previousSnapshot.balance) * progress;
  }

  const anchorSnapshot = previousSnapshot ?? nextSnapshot ?? snapshots[0];

  return projectAccountBalance(account, anchorSnapshot.balance, monthDistance(anchorSnapshot.date, date));
}

function buildAccountBalanceSeries(
  account: AccountProjectionInput,
  snapshots: AccountSnapshot[],
  forecastMonths = accountProjectedMonths,
) {
  const today = new Date();
  const firstSnapshotDate = snapshots[0]?.date;
  const startDate = firstSnapshotDate
    ? new Date(`${firstSnapshotDate}T00:00:00Z`)
    : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const endDate = addUtcMonths(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), forecastMonths);
  const pointsByDate = new Map<string, BankingBalancePoint>();

  function addBalancePoint(dateString: string, label = seriesDateLabel(dateString)) {
    pointsByDate.set(dateString, {
      date: dateString,
      label,
      value: signedBalance(account, accountBalanceAt(account, snapshots, dateString)),
    });
  }

  for (let date = startDate; date <= endDate; date = addUtcMonths(date, 1)) {
    addBalancePoint(date.toISOString().slice(0, 10));
  }

  const todayString = dateKey(today);
  addBalancePoint(todayString, "Today");

  snapshots.forEach((snapshot) => addBalancePoint(snapshot.date, seriesDateLabel(snapshot.date)));

  return Array.from(pointsByDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function buildBalanceSeries(accounts: AccountProjectionInput[], snapshotsByAccount: Map<string, AccountSnapshot[]>) {
  const today = new Date();
  const startDate = addUtcMonths(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), -historicalMonths);
  const endDate = addUtcMonths(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), projectedMonths);
  const points: BankingBalancePoint[] = [];

  for (let date = startDate; date <= endDate; date = addUtcMonths(date, 1)) {
    const dateString = date.toISOString().slice(0, 10);
    const value = accounts.reduce((sum, account) => {
      const snapshots = snapshotsByAccount.get(account.id) ?? [];
      return sum + signedBalance(account, accountBalanceAt(account, snapshots, dateString));
    }, 0);

    points.push({
      date: dateString,
      label: seriesDateLabel(dateString),
      value,
    });
  }

  const todayString = dateKey(today);
  const todayValue = accounts.reduce((sum, account) => {
    const snapshots = snapshotsByAccount.get(account.id) ?? [];
    return sum + signedBalance(account, accountBalanceAt(account, snapshots, todayString));
  }, 0);

  if (!points.some((point) => point.date === todayString)) {
    points.push({
      date: todayString,
      label: "Today",
      value: todayValue,
    });
  }

  return points.sort((left, right) => left.date.localeCompare(right.date));
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
      fa.provider_partner_role_id,
      p.id as partner_id,
      p.display_name as partner_name,
      pr.role as partner_role,
      p.partner_kind,
      p.legal_name as partner_legal_name,
      p.website as partner_website,
      p.notes as partner_notes,
      fa.opening_date::text as opening_date,
      fa.target_close_date::text as target_close_date,
      fa.account_number_mask,
      fa.iban_mask,
      fa.credit_limit,
      fa.include_in_net_worth,
      fa.notes as account_notes,
      active_rate.id as rate_period_id,
      active_rate.rate_type,
      active_rate.annual_rate_percent as rate_percent,
      active_rate.valid_from::text as rate_valid_from,
      active_rate.valid_to::text as rate_valid_to,
      active_rate.capitalization_period as rate_capitalization_period,
      active_rate.notes as rate_notes,
      cf.id as credit_facility_id,
      cf.counterparty_partner_role_id,
      cf.facility_direction,
      cf.monthly_payment,
      cf.payment_day,
      cf.facility_type,
      cf.principal_amount,
      cf.current_principal,
      cf.interest_rate_percent,
      cf.start_date::text as facility_start_date,
      cf.target_end_date::text as target_end_date,
      cf.grace_period_days,
      cf.notes as facility_notes
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
      select
        arp.id,
        arp.rate_type,
        arp.annual_rate_percent,
        arp.valid_from,
        arp.valid_to,
        arp.capitalization_period,
        arp.notes
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

  const accountRows = result.rows.map((row): AccountProjectionInput => ({
    id: row.id,
    name: row.name,
    accountType: row.account_type,
    direction: row.direction,
    currency: row.currency,
    balance: toNumber(row.balance),
    providerPartnerRoleId: row.provider_partner_role_id,
    partnerId: row.partner_id,
    partnerName: row.partner_name ?? "Manual partner",
    partnerRole: row.partner_role ?? "OTHER",
    partnerKind: row.partner_kind ?? "UNKNOWN",
    partnerLegalName: row.partner_legal_name,
    partnerWebsite: row.partner_website,
    partnerNotes: row.partner_notes,
    openingDate: row.opening_date,
    targetCloseDate: row.target_close_date,
    accountNumberMask: row.account_number_mask,
    ibanMask: row.iban_mask,
    creditLimit: row.credit_limit === null ? null : toNumber(row.credit_limit),
    includeInNetWorth: row.include_in_net_worth,
    notes: row.account_notes,
    ratePeriodId: row.rate_period_id,
    rateType: row.rate_type,
    ratePercent: row.rate_percent === null ? null : toNumber(row.rate_percent),
    rateValidFrom: row.rate_valid_from,
    rateValidTo: row.rate_valid_to,
    rateCapitalizationPeriod: row.rate_capitalization_period,
    rateNotes: row.rate_notes,
    creditFacilityId: row.credit_facility_id,
    counterpartyPartnerRoleId: row.counterparty_partner_role_id,
    facilityDirection: row.facility_direction,
    monthlyPayment: row.monthly_payment === null ? null : toNumber(row.monthly_payment),
    paymentDay: row.payment_day,
    facilityType: row.facility_type,
    principalAmount: row.principal_amount === null ? null : toNumber(row.principal_amount),
    currentPrincipal: row.current_principal === null ? null : toNumber(row.current_principal),
    interestRatePercent: row.interest_rate_percent === null ? null : toNumber(row.interest_rate_percent),
    facilityStartDate: row.facility_start_date,
    targetEndDate: row.target_end_date,
    gracePeriodDays: row.grace_period_days,
    facilityNotes: row.facility_notes,
  }));

  const snapshotResult = await pool.query<SnapshotRow>(
    `
    select
      abs.id,
      abs.account_id,
      abs.balance_date::text as balance_date,
      abs.balance,
      abs.currency::text as currency,
      abs.source,
      abs.notes,
      abs.created_at::text as created_at,
      abs.updated_at::text as updated_at
    from public.account_balance_snapshots abs
    join public.financial_accounts fa on fa.id = abs.account_id
    where fa.user_id = $1::uuid
      and fa.is_active = true
    order by abs.account_id, abs.balance_date, abs.created_at
    `,
    [user.dataUserId],
  );

  const snapshotsByAccount = snapshotResult.rows.reduce<Map<string, AccountSnapshot[]>>((map, row) => {
    const snapshots = map.get(row.account_id) ?? [];
    snapshots.push({
      date: row.balance_date,
      balance: toNumber(row.balance),
    });
    map.set(row.account_id, snapshots);

    return map;
  }, new Map());
  const snapshotRowsByAccount = snapshotResult.rows.reduce<Map<string, BankingBalanceSnapshot[]>>((map, row) => {
    const snapshots = map.get(row.account_id) ?? [];
    snapshots.push({
      id: row.id,
      balanceDate: row.balance_date,
      balance: toNumber(row.balance),
      currency: row.currency,
      source: row.source,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    map.set(row.account_id, snapshots);

    return map;
  }, new Map());

  const accounts: BankingAccount[] = accountRows.map((account) => ({
    ...account,
    balanceSnapshots: snapshotRowsByAccount.get(account.id) ?? [],
    balanceSeries: buildAccountBalanceSeries(account, snapshotsByAccount.get(account.id) ?? []),
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
      date: nextPaymentDate(account.paymentDay),
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
    balanceSeries: buildBalanceSeries(accounts, snapshotsByAccount),
    balanceSeriesMeta: {
      snapshotCount: snapshotResult.rows.length,
      historicalMonths,
      projectedMonths,
    },
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
