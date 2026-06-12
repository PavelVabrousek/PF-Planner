import { NextResponse } from "next/server";
import { getCurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SnapshotRow = {
  id: string;
  balance_date: string;
  balance: string | number;
  currency: string;
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

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

function balanceValue(value: unknown) {
  const balance = numberValue(value);

  if (balance === null) {
    throw new Error("Balance must be a valid number.");
  }

  return balance;
}

function dateValue(value: unknown) {
  const date = text(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Balance date must be in YYYY-MM-DD format.");
  }

  return date;
}

function snapshot(row: SnapshotRow) {
  return {
    id: row.id,
    balanceDate: row.balance_date,
    balance: numberValue(row.balance) ?? 0,
    currency: row.currency,
    source: row.source,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

  const accountResult = await pool.query<{ currency: string }>(
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

export async function GET(_request: Request, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  const { error, pool } = await authenticatedContext(accountId);

  if (error || !pool) {
    return error;
  }

  const result = await pool.query<SnapshotRow>(
    `
    select
      id,
      balance_date::text as balance_date,
      balance,
      currency::text as currency,
      source,
      notes,
      created_at::text as created_at,
      updated_at::text as updated_at
    from public.account_balance_snapshots
    where account_id = $1::uuid
    order by balance_date desc, created_at desc
    `,
    [accountId],
  );

  return NextResponse.json(
    { snapshots: result.rows.map(snapshot) },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  const { error, pool, account } = await authenticatedContext(accountId);

  if (error || !pool || !account) {
    return error;
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const result = await pool.query<SnapshotRow>(
      `
      insert into public.account_balance_snapshots (
        account_id,
        balance_date,
        balance,
        currency,
        source,
        notes
      )
      values ($1::uuid, $2::date, $3::numeric, $4::char(3), 'MANUAL', $5::text)
      returning
        id,
        balance_date::text as balance_date,
        balance,
        currency::text as currency,
        source,
        notes,
        created_at::text as created_at,
        updated_at::text as updated_at
      `,
      [accountId, dateValue(payload.balanceDate), balanceValue(payload.balance), account.currency, optionalText(payload.notes)],
    );

    return NextResponse.json({ ok: true, snapshot: snapshot(result.rows[0]) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not save balance.");
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  const { error, pool, account } = await authenticatedContext(accountId);

  if (error || !pool || !account) {
    return error;
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const snapshotId = text(payload.snapshotId);

    if (!snapshotId) {
      throw new Error("Snapshot id is required.");
    }

    const result = await pool.query<SnapshotRow>(
      `
      update public.account_balance_snapshots
      set
        balance_date = $3::date,
        balance = $4::numeric,
        currency = $5::char(3),
        notes = $6::text,
        updated_at = now()
      where id = $1::uuid
        and account_id = $2::uuid
      returning
        id,
        balance_date::text as balance_date,
        balance,
        currency::text as currency,
        source,
        notes,
        created_at::text as created_at,
        updated_at::text as updated_at
      `,
      [
        snapshotId,
        accountId,
        dateValue(payload.balanceDate),
        balanceValue(payload.balance),
        account.currency,
        optionalText(payload.notes),
      ],
    );

    if (!result.rows[0]) {
      return jsonError("Balance snapshot not found.", 404);
    }

    return NextResponse.json({ ok: true, snapshot: snapshot(result.rows[0]) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not update balance.");
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  const { error, pool } = await authenticatedContext(accountId);

  if (error || !pool) {
    return error;
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const snapshotId = text(payload.snapshotId);

    if (!snapshotId) {
      throw new Error("Snapshot id is required.");
    }

    const result = await pool.query<{ id: string }>(
      `
      delete from public.account_balance_snapshots
      where id = $1::uuid
        and account_id = $2::uuid
      returning id
      `,
      [snapshotId, accountId],
    );

    if (!result.rows[0]) {
      return jsonError("Balance snapshot not found.", 404);
    }

    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not delete balance.");
  }
}
