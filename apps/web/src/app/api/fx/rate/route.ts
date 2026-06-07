import { NextResponse } from "next/server";
import { getCurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PortfolioRow = {
  base_currency: string;
};

type FxRateRow = {
  rate_date: string;
  from_currency: string;
  to_currency: string;
  rate: string | number;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

function currencyCode(value: string | null, field: string) {
  const currency = value?.trim().toUpperCase() ?? "";

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`${field} must be a 3-letter currency code.`);
  }

  return currency;
}

function dateKey(value: string | null) {
  const date = value?.trim() ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Date must be in YYYY-MM-DD format.");
  }

  return date;
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

async function latestRate(pool: ReturnType<typeof createPostgresPool>, from: string, to: string, targetDate: string) {
  if (!pool) {
    return null;
  }

  const result = await pool.query<FxRateRow>(
    `
    select rate_date::text as rate_date, from_currency::text as from_currency, to_currency::text as to_currency, rate
    from public.fx_rates
    where from_currency = $1::char(3)
      and to_currency = $2::char(3)
      and rate_date <= $3::date
    order by rate_date desc
    limit 1
    `,
    [from, to, targetDate],
  );

  return result.rows[0] ?? null;
}

export async function GET(request: Request) {
  const auth = await getCurrentPfpUser();

  if (auth.status !== "authenticated") {
    return jsonError(auth.message, auth.status === "forbidden" ? 403 : 401);
  }

  const pool = createPostgresPool();

  if (!pool) {
    return jsonError("Missing database connection.", 503);
  }

  try {
    const url = new URL(request.url);
    const from = currencyCode(url.searchParams.get("from"), "From currency");
    const to = currencyCode(url.searchParams.get("to"), "To currency");
    const date = dateKey(url.searchParams.get("date"));

    if (from === to) {
      return NextResponse.json(
        { rate: 1, rateDate: date, source: "same_currency" },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const direct = await latestRate(pool, from, to, date);
    const directRate = toNumber(direct?.rate);

    if (direct && directRate && directRate > 0) {
      return NextResponse.json(
        { rate: directRate, rateDate: direct.rate_date, source: "direct" },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const inverse = await latestRate(pool, to, from, date);
    const inverseRate = toNumber(inverse?.rate);

    if (inverse && inverseRate && inverseRate > 0) {
      return NextResponse.json(
        { rate: 1 / inverseRate, rateDate: inverse.rate_date, source: "inverse" },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const portfolioResult = await pool.query<PortfolioRow>(
      `
      select base_currency::text as base_currency
      from public.portfolios
      where user_id = $1::uuid
        and is_archived = false
      order by created_at asc
      limit 1
      `,
      [auth.user.dataUserId],
    );
    const pivot = portfolioResult.rows[0]?.base_currency;

    if (pivot && pivot !== from && pivot !== to) {
      const fromToPivot = await latestRate(pool, from, pivot, date);
      const toToPivot = await latestRate(pool, to, pivot, date);
      const fromRate = toNumber(fromToPivot?.rate);
      const toRate = toNumber(toToPivot?.rate);

      if (fromToPivot && toToPivot && fromRate && toRate && toRate > 0) {
        return NextResponse.json(
          {
            rate: fromRate / toRate,
            rateDate: fromToPivot.rate_date < toToPivot.rate_date ? fromToPivot.rate_date : toToPivot.rate_date,
            source: "pivot",
            pivot,
          },
          { headers: { "cache-control": "no-store" } },
        );
      }
    }

    return jsonError(`No FX rate found for ${from} to ${to} on or before ${date}.`, 404);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "FX rate lookup failed.");
  }
}
