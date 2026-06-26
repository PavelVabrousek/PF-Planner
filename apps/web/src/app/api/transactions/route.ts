import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { Pool, PoolClient } from "pg";
import { getCurrentPfpUser, type CurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";
import { getUserActivePortfolio } from "@/lib/portfolio/active-portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PortfolioRow = {
  id: string;
  name: string;
  base_currency: string;
};

type AssetRow = {
  id: string;
  symbol: string;
  currency: string;
};

type CashAccountInput = {
  id?: unknown;
  broker?: unknown;
  currency?: unknown;
  name?: unknown;
};

type AssetCandidateInput = {
  symbol?: unknown;
  name?: unknown;
  broker?: unknown;
  currency?: unknown;
  assetType?: unknown;
  providerSymbol?: unknown;
  isin?: unknown;
};

type CreateTransactionPayload = {
  type?: unknown;
  tradeDate?: unknown;
  assetId?: unknown;
  assetCandidate?: AssetCandidateInput;
  quantity?: unknown;
  price?: unknown;
  grossAmount?: unknown;
  cashAccountGrossAmount?: unknown;
  tradeGrossAmount?: unknown;
  grossAmountIncludesCosts?: unknown;
  tradeCurrency?: unknown;
  fxRate?: unknown;
  fxFeePercent?: unknown;
  currency?: unknown;
  fee?: unknown;
  tax?: unknown;
  notes?: unknown;
  cashAccount?: CashAccountInput;
  toCashAccount?: CashAccountInput;
  toAmount?: unknown;
};

type TransactionType = "BUY" | "SELL" | "CASH_DEPOSIT" | "CASH_WITHDRAWAL" | "FX_CONVERSION";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const next = text(value);
  return next || null;
}

function numberValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function positiveNumber(value: unknown, field: string) {
  const parsed = numberValue(value);

  if (parsed === null || parsed <= 0) {
    throw new Error(`${field} must be a positive number.`);
  }

  return parsed;
}

function nonNegativeNumber(value: unknown, field: string) {
  const parsed = value === undefined || value === null || value === "" ? 0 : numberValue(value);

  if (parsed === null || parsed < 0) {
    throw new Error(`${field} must be zero or a positive number.`);
  }

  return parsed;
}

function booleanValue(value: unknown) {
  return value === true || value === "true";
}

function currencyCode(value: unknown, field = "Currency") {
  const currency = text(value).toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`${field} must be a 3-letter currency code.`);
  }

  return currency;
}

function assetType(value: unknown) {
  const type = text(value).toUpperCase();

  if (type === "STOCK" || type === "ETF" || type === "CRYPTO" || type === "CASH") {
    return type;
  }

  return "STOCK";
}

function tradeDate(value: unknown) {
  const date = text(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Trade date must be in YYYY-MM-DD format.");
  }

  return date;
}

function transactionType(value: unknown): TransactionType {
  const type = text(value).toUpperCase();

  if (
    type === "BUY" ||
    type === "SELL" ||
    type === "CASH_DEPOSIT" ||
    type === "CASH_WITHDRAWAL" ||
    type === "FX_CONVERSION"
  ) {
    return type;
  }

  throw new Error("Unsupported transaction type.");
}

async function getPortfolio(pool: Pool, user: CurrentPfpUser) {
  return getUserActivePortfolio(pool, user);
}

async function getAsset(client: PoolClient, assetId: string) {
  const result = await client.query<AssetRow>(
    `
    select id, symbol, currency::text as currency
    from public.assets
    where id = $1::uuid
      and is_active = true
    limit 1
    `,
    [assetId],
  );

  return result.rows[0] ?? null;
}

async function getOrCreateAsset(client: PoolClient, assetId: string, candidate: AssetCandidateInput | undefined) {
  if (assetId) {
    return getAsset(client, assetId);
  }

  const symbol = text(candidate?.symbol).toUpperCase();
  const broker = text(candidate?.broker).toUpperCase();
  const currency = currencyCode(candidate?.currency, "Asset currency");
  const name = optionalText(candidate?.name);
  const providerSymbol = optionalText(candidate?.providerSymbol) ?? symbol;
  const isin = optionalText(candidate?.isin);
  const type = assetType(candidate?.assetType);

  if (!symbol || !broker) {
    throw new Error("Asset is required.");
  }

  const result = await client.query<AssetRow>(
    `
    insert into public.assets (symbol, broker, name, currency, asset_type, data_provider, provider_symbol, isin)
    values ($1::text, $2::text, $3::text, $4::char(3), $5::text, 'yfinance', $6::text, $7::text)
    on conflict (broker, symbol) do update
    set
      name = coalesce(public.assets.name, excluded.name),
      currency = excluded.currency,
      asset_type = excluded.asset_type,
      data_provider = coalesce(public.assets.data_provider, excluded.data_provider),
      provider_symbol = coalesce(public.assets.provider_symbol, excluded.provider_symbol),
      isin = coalesce(public.assets.isin, excluded.isin),
      is_active = true,
      updated_at = now()
    returning id, symbol, currency::text as currency
    `,
    [symbol, broker, name, currency, type, providerSymbol, isin],
  );

  return result.rows[0] ?? null;
}

async function getHoldingQuantity(client: PoolClient, portfolioId: string, assetId: string) {
  const result = await client.query<{ quantity: string | number }>(
    `
    select coalesce(
      sum(
        case
          when type = 'BUY' then quantity
          when type = 'SELL' then -quantity
          else 0
        end
      ),
      0
    ) as quantity
    from public.transactions
    where portfolio_id = $1::uuid
      and asset_id = $2::uuid
      and type in ('BUY', 'SELL')
    `,
    [portfolioId, assetId],
  );

  return numberValue(result.rows[0]?.quantity) ?? 0;
}

async function getOrCreateCashAccount(client: PoolClient, portfolioId: string, input: CashAccountInput | undefined) {
  const id = text(input?.id);

  if (id) {
    const result = await client.query<{ id: string; currency: string }>(
      `
      select id, currency::text as currency
      from public.portfolio_cash_accounts
      where id = $1::uuid
        and portfolio_id = $2::uuid
        and is_active = true
      limit 1
      `,
      [id, portfolioId],
    );

    if (!result.rows[0]) {
      throw new Error("Selected cash account was not found in this portfolio.");
    }

    return result.rows[0];
  }

  const broker = text(input?.broker).toUpperCase();
  const currency = currencyCode(input?.currency, "Cash account currency");
  const name = optionalText(input?.name);

  if (!broker) {
    throw new Error("Cash account broker is required.");
  }

  const existing = await client.query<{ id: string; currency: string }>(
    `
    select id, currency::text as currency
    from public.portfolio_cash_accounts
    where portfolio_id = $1::uuid
      and lower(broker) = lower($2::text)
      and currency = $3::char(3)
    limit 1
    `,
    [portfolioId, broker, currency],
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const created = await client.query<{ id: string; currency: string }>(
    `
    insert into public.portfolio_cash_accounts (portfolio_id, broker, currency, name)
    values ($1::uuid, $2::text, $3::char(3), $4::text)
    returning id, currency::text as currency
    `,
    [portfolioId, broker, currency, name],
  );

  return created.rows[0];
}

export async function POST(request: Request) {
  const auth = await getCurrentPfpUser();

  if (auth.status !== "authenticated") {
    return jsonError(auth.message, auth.status === "forbidden" ? 403 : 401);
  }

  const pool = createPostgresPool();

  if (!pool) {
    return jsonError("Missing database connection.", 503);
  }

  let payload: CreateTransactionPayload;

  try {
    payload = (await request.json()) as CreateTransactionPayload;
  } catch {
    return jsonError("Invalid JSON payload.");
  }

  let portfolio: PortfolioRow | null;

  try {
    portfolio = await getPortfolio(pool, auth.user);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve active portfolio.";

    return jsonError(message, 409);
  }

  if (!portfolio) {
    return jsonError("No active portfolio found for the authenticated PFP user.", 404);
  }

  const client = await pool.connect();

  try {
    const type = transactionType(payload.type);
    const date = tradeDate(payload.tradeDate);
    const notes = optionalText(payload.notes);
    const fee = nonNegativeNumber(payload.fee, "Fee");
    const tax = nonNegativeNumber(payload.tax, "Tax");

    await client.query("begin");

    if (type === "BUY" || type === "SELL") {
      const assetId = text(payload.assetId);
      const asset = await getOrCreateAsset(client, assetId, payload.assetCandidate);

      if (!asset) {
        throw new Error("Selected asset was not found.");
      }

      const quantity = positiveNumber(payload.quantity, "Quantity");
      const price = positiveNumber(payload.price, "Price");
      const tradeCurrency = currencyCode(payload.currency || payload.tradeCurrency || asset.currency);
      const feeAndTax = fee + tax;
      const submittedTradeGrossAmount = numberValue(payload.tradeGrossAmount ?? payload.grossAmount) ?? quantity * price;
      const tradeGrossAmount = booleanValue(payload.grossAmountIncludesCosts)
        ? Math.max(0, submittedTradeGrossAmount - feeAndTax)
        : submittedTradeGrossAmount;
      const cashAccount = payload.cashAccount
        ? await getOrCreateCashAccount(client, portfolio.id, payload.cashAccount)
        : null;
      const submittedCashAccountGrossAmount = numberValue(payload.cashAccountGrossAmount);
      const grossAmount =
        submittedCashAccountGrossAmount !== null
          ? booleanValue(payload.grossAmountIncludesCosts)
            ? Math.max(0, submittedCashAccountGrossAmount - feeAndTax)
            : positiveNumber(payload.cashAccountGrossAmount, "Cash account value")
          : tradeGrossAmount;
      const currency = cashAccount?.currency ?? tradeCurrency;
      const fxRate = numberValue(payload.fxRate);
      const fxFeePercent = nonNegativeNumber(payload.fxFeePercent, "FX fee");

      if (type === "SELL") {
        const heldQuantity = await getHoldingQuantity(client, portfolio.id, asset.id);

        if (quantity > heldQuantity + 0.00000001) {
          throw new Error(`Sell quantity exceeds current holding (${heldQuantity}).`);
        }
      }

      const result = await client.query<{ id: string }>(
        `
        insert into public.transactions (
          portfolio_id,
          asset_id,
          cash_account_id,
          type,
          trade_date,
          quantity,
          price,
          gross_amount,
          fee,
          tax,
          currency,
          source,
          notes,
          metadata
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::text,
          $5::date,
          $6::numeric,
          $7::numeric,
          $8::numeric,
          $9::numeric,
          $10::numeric,
          $11::char(3),
          'MANUAL',
          $12::text,
          $13::jsonb
        )
        returning id
        `,
        [
          portfolio.id,
          asset.id,
          cashAccount?.id ?? null,
          type,
          date,
          quantity,
          price,
          grossAmount,
          fee,
          tax,
          currency,
          notes,
          JSON.stringify({
            created_by: "pfp_transaction_modal",
            trade_currency: tradeCurrency,
            trade_gross_amount: submittedTradeGrossAmount,
            stored_trade_gross_amount: tradeGrossAmount,
            cash_account_currency: currency,
            cash_account_gross_amount: submittedCashAccountGrossAmount ?? grossAmount,
            stored_cash_account_gross_amount: grossAmount,
            gross_amount_includes_costs: booleanValue(payload.grossAmountIncludesCosts),
            fx_rate: fxRate,
            fx_fee_percent: fxFeePercent,
          }),
        ],
      );

      await client.query("commit");
      return NextResponse.json({ id: result.rows[0].id }, { headers: { "cache-control": "no-store" } });
    }

    if (type === "CASH_DEPOSIT" || type === "CASH_WITHDRAWAL") {
      const cashAccount = await getOrCreateCashAccount(client, portfolio.id, payload.cashAccount);
      const grossAmount = positiveNumber(payload.grossAmount, "Amount");

      const result = await client.query<{ id: string }>(
        `
        insert into public.transactions (
          portfolio_id,
          cash_account_id,
          type,
          trade_date,
          gross_amount,
          fee,
          tax,
          currency,
          source,
          notes,
          metadata
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::text,
          $4::date,
          $5::numeric,
          $6::numeric,
          $7::numeric,
          $8::char(3),
          'MANUAL',
          $9::text,
          $10::jsonb
        )
        returning id
        `,
        [
          portfolio.id,
          cashAccount.id,
          type,
          date,
          grossAmount,
          fee,
          tax,
          cashAccount.currency,
          notes,
          JSON.stringify({ created_by: "pfp_transaction_modal" }),
        ],
      );

      await client.query("commit");
      return NextResponse.json({ id: result.rows[0].id }, { headers: { "cache-control": "no-store" } });
    }

    const fromCashAccount = await getOrCreateCashAccount(client, portfolio.id, payload.cashAccount);
    const toCashAccount = await getOrCreateCashAccount(client, portfolio.id, payload.toCashAccount);
    const fromAmount = positiveNumber(payload.grossAmount, "Source amount");
    const toAmount = positiveNumber(payload.toAmount, "Target amount");
    const conversionGroupId = randomUUID();
    const metadata = JSON.stringify({
      created_by: "pfp_transaction_modal",
      transaction_intent: "FX_CONVERSION",
      conversion_group_id: conversionGroupId,
      from_cash_account_id: fromCashAccount.id,
      to_cash_account_id: toCashAccount.id,
      rate: toAmount / fromAmount,
    });

    const withdrawal = await client.query<{ id: string }>(
      `
      insert into public.transactions (
        portfolio_id,
        cash_account_id,
        type,
        trade_date,
        gross_amount,
        fee,
        tax,
        currency,
        source,
        notes,
        metadata
      )
      values (
        $1::uuid,
        $2::uuid,
        'CASH_WITHDRAWAL',
        $3::date,
        $4::numeric,
        $5::numeric,
        0,
        $6::char(3),
        'MANUAL',
        $7::text,
        $8::jsonb
      )
      returning id
      `,
      [portfolio.id, fromCashAccount.id, date, fromAmount, fee, fromCashAccount.currency, notes, metadata],
    );
    const deposit = await client.query<{ id: string }>(
      `
      insert into public.transactions (
        portfolio_id,
        cash_account_id,
        type,
        trade_date,
        gross_amount,
        fee,
        tax,
        currency,
        source,
        notes,
        metadata
      )
      values (
        $1::uuid,
        $2::uuid,
        'CASH_DEPOSIT',
        $3::date,
        $4::numeric,
        0,
        0,
        $5::char(3),
        'MANUAL',
        $6::text,
        $7::jsonb
      )
      returning id
      `,
      [portfolio.id, toCashAccount.id, date, toAmount, toCashAccount.currency, notes, metadata],
    );

    await client.query("commit");
    return NextResponse.json(
      { id: conversionGroupId, transactionIds: [withdrawal.rows[0].id, deposit.rows[0].id] },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return jsonError(error instanceof Error ? error.message : "Transaction could not be saved.");
  } finally {
    client.release();
  }
}
