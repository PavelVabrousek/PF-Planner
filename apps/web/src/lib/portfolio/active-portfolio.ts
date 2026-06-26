import type { Pool, PoolClient } from "pg";
import type { CurrentPfpUser } from "@/lib/auth/current-user";

export type ActivePortfolio = {
  id: string;
  name: string;
  base_currency: string;
  cost_basis_method: string;
  transaction_count: string | number;
  owner_display_name?: string | null;
};

type Queryable = Pick<Pool | PoolClient, "query">;
type PortfolioUser = Pick<CurrentPfpUser, "dataUserId" | "email">;

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function titleCaseToken(value: string) {
  if (!value) {
    return value;
  }

  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1).toLowerCase()}`;
}

function nameFromEmail(email: string | null | undefined) {
  const localPart = email?.split("@")[0]?.split("+")[0];

  if (!localPart) {
    return null;
  }

  const name = localPart
    .split(/[._-]+/)
    .map((token) => titleCaseToken(token.replace(/[^a-z0-9]/gi, "")))
    .filter(Boolean)
    .join(" ");

  return name || null;
}

export function expectedPortfolioNameForUser(user: PortfolioUser, displayName?: string | null) {
  const ownerName = normalizeSpaces(displayName ?? "");
  const portfolioOwner =
    ownerName && !ownerName.includes("@") ? ownerName : nameFromEmail(user.email) ?? "User";

  return portfolioOwner.toLowerCase().endsWith(" portfolio") ? portfolioOwner : `${portfolioOwner} Portfolio`;
}

function transactionCount(portfolio: ActivePortfolio) {
  const count =
    typeof portfolio.transaction_count === "number"
      ? portfolio.transaction_count
      : Number(portfolio.transaction_count);

  return Number.isFinite(count) ? count : 0;
}

export function selectSingleActivePortfolio(portfolios: ActivePortfolio[]) {
  const portfoliosWithTransactions = portfolios.filter((portfolio) => transactionCount(portfolio) > 0);

  if (portfoliosWithTransactions.length > 1) {
    throw new Error("Multiple active portfolios with transactions are not supported yet.");
  }

  return portfoliosWithTransactions[0] ?? portfolios[0] ?? null;
}

async function normalizePortfolioName(db: Queryable, user: PortfolioUser, portfolio: ActivePortfolio) {
  const expectedName = expectedPortfolioNameForUser(user, portfolio.owner_display_name);

  if (portfolio.name === expectedName) {
    return portfolio;
  }

  await db.query(
    `
    update public.portfolios
    set name = $1::text
    where id = $2::uuid
      and user_id = $3::uuid
      and is_archived = false
    `,
    [expectedName, portfolio.id, user.dataUserId],
  );

  return { ...portfolio, name: expectedName };
}

export async function getUserActivePortfolio(db: Queryable, user: PortfolioUser) {
  const result = await db.query<ActivePortfolio>(
    `
    select
      p.id,
      p.name,
      p.base_currency::text as base_currency,
      p.cost_basis_method,
      pr.display_name as owner_display_name,
      count(t.id) as transaction_count
    from public.portfolios p
    join public.profiles pr on pr.id = p.user_id
    left join public.transactions t on t.portfolio_id = p.id
    where p.user_id = $1::uuid
      and p.is_archived = false
    group by
      p.id,
      p.name,
      p.base_currency,
      p.cost_basis_method,
      pr.display_name,
      p.created_at
    order by
      count(t.id) desc,
      p.created_at asc
    `,
    [user.dataUserId],
  );

  const portfolio = selectSingleActivePortfolio(result.rows);

  return portfolio ? normalizePortfolioName(db, user, portfolio) : null;
}
