import { NextResponse } from "next/server";
import { getCurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccountRow = {
  currency: string;
};

type TransactionRow = {
  id: string;
  transaction_date: string;
  amount: string | number;
  currency: string;
  direction: string;
  transaction_type: string;
  description: string | null;
};

const transactionDirections = ["INFLOW", "OUTFLOW"] as const;
const transactionTypes = [
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
    const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function amountValue(value: unknown) {
  const amount = numberValue(value);

  if (amount === null || amount < 0) {
    throw new Error("Amount must be zero or a positive number.");
  }

  return amount;
}

function dateValue(value: unknown) {
  const date = text(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Transaction date must be in YYYY-MM-DD format.");
  }

  return date;
}

function directionValue(value: unknown) {
  const direction = text(value).toUpperCase();

  if (transactionDirections.includes(direction as (typeof transactionDirections)[number])) {
    return direction;
  }

  throw new Error("Unsupported transaction direction.");
}

function transactionTypeValue(value: unknown) {
  const transactionType = text(value).toUpperCase();

  if (transactionTypes.includes(transactionType as (typeof transactionTypes)[number])) {
    return transactionType;
  }

  throw new Error("Unsupported transaction type.");
}

function transaction(row: TransactionRow) {
  return {
    id: row.id,
    transactionDate: row.transaction_date,
    amount: numberValue(row.amount) ?? 0,
    currency: row.currency,
    direction: row.direction,
    transactionType: row.transaction_type,
    description: row.description,
  };
}

async function authenticatedContext(accountId: string) {
  const auth = await getCurrentPfpUser();

  if (auth.status !== "authenticated") {
    return { error: jsonError("Authentication required.", 401), pool: null, account: null };
  }

  const pool = createPostgresPool();

  if (!pool) {
    return { error: jsonError("Missing database connection.", 500), pool: null, account: null };
  }

  const accountResult = await pool.query<AccountRow>(
    `
    select currency::text as currency
    from public.financial_accounts
    where id = $1::uuid
      and user_id = $2::uuid
    limit 1
    `,
    [accountId, auth.user.dataUserId],
  );
  const account = accountResult.rows[0];

  if (!account) {
    return { error: jsonError("Account not found.", 404), pool: null, account: null };
  }

  return { error: null, pool, account };
}

export async function POST(request: Request, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  const { error, pool, account } = await authenticatedContext(accountId);

  if (error || !pool || !account) {
    return error;
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const result = await pool.query<TransactionRow>(
      `
      insert into public.account_transactions (
        account_id,
        transaction_date,
        amount,
        currency,
        direction,
        transaction_type,
        description,
        source,
        metadata
      )
      values ($1::uuid, $2::date, $3::numeric, $4::char(3), $5::text, $6::text, $7::text, 'MANUAL', $8::jsonb)
      returning
        id,
        transaction_date::text as transaction_date,
        amount,
        currency::text as currency,
        direction,
        transaction_type,
        description
      `,
      [
        accountId,
        dateValue(payload.transactionDate),
        amountValue(payload.amount),
        account.currency,
        directionValue(payload.direction),
        transactionTypeValue(payload.transactionType),
        optionalText(payload.description),
        JSON.stringify({ created_by: "pfp_banking_account_menu" }),
      ],
    );

    return NextResponse.json(
      { ok: true, transaction: transaction(result.rows[0]) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not save transaction.");
  }
}
