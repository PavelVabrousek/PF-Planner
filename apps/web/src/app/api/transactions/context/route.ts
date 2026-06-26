import { NextResponse } from "next/server";
import { getCurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";
import { getUserActivePortfolio } from "@/lib/portfolio/active-portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PortfolioRow = {
  id: string;
  name: string;
  base_currency: string;
};

type HoldingRow = {
  asset_id: string;
  symbol: string;
  name: string | null;
  broker: string;
  currency: string;
  asset_type: string;
  quantity: string | number;
  latest_price: string | number | null;
  latest_price_currency: string | null;
};

type CashAccountRow = {
  id: string;
  broker: string;
  currency: string;
  name: string | null;
  balance: string | number;
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

export async function GET() {
  const auth = await getCurrentPfpUser();

  if (auth.status !== "authenticated") {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status === "forbidden" ? 403 : 401, headers: { "cache-control": "no-store" } },
    );
  }

  const pool = createPostgresPool();

  if (!pool) {
    return NextResponse.json(
      { error: "Missing database connection." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  let portfolio: PortfolioRow | null;

  try {
    portfolio = await getUserActivePortfolio(pool, auth.user);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve active portfolio.";

    return NextResponse.json({ error: message }, { status: 409, headers: { "cache-control": "no-store" } });
  }

  if (!portfolio) {
    return NextResponse.json(
      { error: "No active portfolio found for the authenticated PFP user." },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  const [holdingsResult, cashAccountsResult] = await Promise.all([
    pool.query<HoldingRow>(
      `
      with latest_prices as (
        select distinct on (asset_id)
          asset_id,
          coalesce(adjusted_close, close) as latest_price,
          currency::text as latest_price_currency
        from public.daily_prices
        order by asset_id, price_date desc
      )
      select
        a.id as asset_id,
        a.symbol,
        a.name,
        a.broker,
        a.currency::text as currency,
        a.asset_type,
        sum(
          case
            when t.type = 'BUY' then t.quantity
            when t.type = 'SELL' then -t.quantity
            else 0
          end
        ) as quantity,
        lp.latest_price,
        lp.latest_price_currency
      from public.transactions t
      join public.assets a on a.id = t.asset_id
      left join latest_prices lp on lp.asset_id = a.id
      where t.portfolio_id = $1::uuid
        and t.type in ('BUY', 'SELL')
      group by
        a.id,
        a.symbol,
        a.name,
        a.broker,
        a.currency,
        a.asset_type,
        lp.latest_price,
        lp.latest_price_currency
      having sum(
        case
          when t.type = 'BUY' then t.quantity
          when t.type = 'SELL' then -t.quantity
          else 0
        end
      ) > 0
      order by a.symbol
      `,
      [portfolio.id],
    ),
    pool.query<CashAccountRow>(
      `
      select
        pca.id,
        pca.broker,
        pca.currency::text as currency,
        pca.name,
        coalesce(
          sum(
            case
              when t.type in ('CASH_DEPOSIT', 'SELL', 'DIVIDEND') then t.gross_amount - t.fee - t.tax
              when t.type in ('CASH_WITHDRAWAL', 'BUY', 'FEE', 'TAX') then -(t.gross_amount + t.fee + t.tax)
              when t.type = 'CASH_ADJUSTMENT' then t.gross_amount
              else 0
            end
          ),
          0
        ) as balance
      from public.portfolio_cash_accounts pca
      left join public.transactions t on t.cash_account_id = pca.id
      where pca.portfolio_id = $1::uuid
        and pca.is_active = true
      group by pca.id, pca.broker, pca.currency, pca.name
      order by pca.broker, pca.currency
      `,
      [portfolio.id],
    ),
  ]);

  return NextResponse.json(
    {
      portfolio,
      holdings: holdingsResult.rows.map((holding) => ({
        assetId: holding.asset_id,
        symbol: holding.symbol,
        name: holding.name,
        broker: holding.broker,
        currency: holding.currency,
        assetType: holding.asset_type,
        quantity: toNumber(holding.quantity),
        latestPrice: toNumber(holding.latest_price),
        latestPriceCurrency: holding.latest_price_currency ?? holding.currency,
      })),
      cashAccounts: cashAccountsResult.rows.map((account) => ({
        id: account.id,
        broker: account.broker,
        currency: account.currency,
        name: account.name,
        balance: toNumber(account.balance),
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
