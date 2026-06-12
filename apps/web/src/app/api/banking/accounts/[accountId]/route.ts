import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { getCurrentPfpUser, type CurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const accountTypes = new Set([
  "CURRENT",
  "SAVINGS",
  "CASH_WALLET",
  "CREDIT_CARD",
  "LOAN",
  "MORTGAGE",
  "PRIVATE_LOAN",
  "OTHER_ASSET",
  "OTHER_LIABILITY",
]);

const accountDirections = new Set(["ASSET", "LIABILITY", "RECEIVABLE"]);
const partnerKinds = new Set(["PERSON", "COMPANY", "INSTITUTION", "GOVERNMENT", "HOUSEHOLD", "UNKNOWN"]);
const partnerRoles = new Set([
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
]);
const rateTypes = new Set(["SAVINGS_INTEREST", "LOAN_INTEREST", "CARD_APR", "PROMOTIONAL", "OTHER"]);
const facilityTypes = new Set(["CREDIT_CARD", "MORTGAGE", "CONSUMER_LOAN", "PRIVATE_LOAN", "OTHER"]);
const facilityDirections = new Set(["BORROWED", "LENT"]);

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

function enumValue(value: unknown, values: Set<string>, field: string, fallback?: string) {
  const nextValue = text(value).toUpperCase() || fallback;

  if (!nextValue || !values.has(nextValue)) {
    throw new Error(`${field} is not supported.`);
  }

  return nextValue;
}

function currencyCode(value: unknown) {
  const currency = text(value).toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Currency must be a 3-letter code.");
  }

  return currency;
}

function optionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return value;
    }

    throw new Error(`${field} must be a valid number.`);
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(`${field} must be a valid number.`);
}

function nonNegativeNumber(value: unknown, field: string) {
  const parsed = optionalNumber(value, field);

  if (parsed !== null && parsed < 0) {
    throw new Error(`${field} must be zero or a positive number.`);
  }

  return parsed;
}

function paymentDay(value: unknown) {
  const parsed = nonNegativeNumber(value, "Payment day");

  if (parsed === null) {
    return null;
  }

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
    throw new Error("Payment day must be between 1 and 31.");
  }

  return parsed;
}

function nonNegativeInteger(value: unknown, field: string) {
  const parsed = nonNegativeNumber(value, field);

  if (parsed === null) {
    return null;
  }

  if (!Number.isInteger(parsed)) {
    throw new Error(`${field} must be a whole number.`);
  }

  return parsed;
}

function optionalDate(value: unknown, field: string) {
  const date = text(value);

  if (!date) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${field} must be in YYYY-MM-DD format.`);
  }

  return date;
}

function booleanValue(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value === "true";
  }

  return fallback;
}

function hasAnyValue(values: unknown[]) {
  return values.some((value) => value !== undefined && value !== null && value !== "");
}

async function authenticatedUser() {
  const auth = await getCurrentPfpUser();

  if (auth.status !== "authenticated") {
    return null;
  }

  return auth.user;
}

async function ensurePartnerRole(client: PoolClient, user: CurrentPfpUser, payload: Record<string, unknown>) {
  const displayName = text(payload.partnerName);

  if (!displayName) {
    return null;
  }

  const partnerKind = enumValue(payload.partnerKind, partnerKinds, "Partner kind", "UNKNOWN");
  const role = enumValue(payload.partnerRole, partnerRoles, "Partner role", "OTHER");
  const partnerResult = await client.query<{ id: string }>(
    `
    select id
    from public.partners
    where user_id = $1::uuid
      and lower(display_name) = lower($2::text)
    limit 1
    `,
    [user.dataUserId, displayName],
  );
  let partnerId = partnerResult.rows[0]?.id;

  if (partnerId) {
    await client.query(
      `
      update public.partners
      set
        display_name = $2::text,
        legal_name = $3::text,
        partner_kind = $4::text,
        website = $5::text,
        notes = $6::text,
        updated_at = now()
      where id = $1::uuid
      `,
      [
        partnerId,
        displayName,
        optionalText(payload.partnerLegalName),
        partnerKind,
        optionalText(payload.partnerWebsite),
        optionalText(payload.partnerNotes),
      ],
    );
  } else {
    const insertedPartner = await client.query<{ id: string }>(
      `
      insert into public.partners (
        user_id,
        display_name,
        legal_name,
        partner_kind,
        website,
        notes
      )
      values ($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text)
      returning id
      `,
      [
        user.dataUserId,
        displayName,
        optionalText(payload.partnerLegalName),
        partnerKind,
        optionalText(payload.partnerWebsite),
        optionalText(payload.partnerNotes),
      ],
    );
    partnerId = insertedPartner.rows[0].id;
  }

  const roleResult = await client.query<{ id: string }>(
    `
    select id
    from public.partner_roles
    where partner_id = $1::uuid
      and role = $2::text
      and valid_to is null
    limit 1
    `,
    [partnerId, role],
  );

  if (roleResult.rows[0]) {
    return roleResult.rows[0].id;
  }

  const insertedRole = await client.query<{ id: string }>(
    `
    insert into public.partner_roles (partner_id, role, is_primary)
    values ($1::uuid, $2::text, true)
    returning id
    `,
    [partnerId, role],
  );

  return insertedRole.rows[0].id;
}

async function upsertRatePeriod(client: PoolClient, accountId: string, payload: Record<string, unknown>) {
  const activeRateResult = await client.query<{ id: string }>(
    `
    select id
    from public.account_rate_periods
    where account_id = $1::uuid
      and valid_from <= current_date
      and (valid_to is null or valid_to >= current_date)
    order by valid_from desc
    limit 1
    `,
    [accountId],
  );
  const activeRateId = activeRateResult.rows[0]?.id;
  const annualRatePercent = optionalNumber(payload.ratePercent, "Annual rate");

  if (annualRatePercent === null) {
    if (activeRateId) {
      await client.query(
        `
        update public.account_rate_periods
        set valid_to = least(current_date, coalesce(valid_to, current_date)), updated_at = now()
        where id = $1::uuid
        `,
        [activeRateId],
      );
    }

    return;
  }

  const rateType = enumValue(payload.rateType, rateTypes, "Rate type", "OTHER");
  const validFrom = optionalDate(payload.rateValidFrom, "Rate valid from") ?? new Date().toISOString().slice(0, 10);
  const validTo = optionalDate(payload.rateValidTo, "Rate valid to");

  if (activeRateId) {
    await client.query(
      `
      update public.account_rate_periods
      set
        rate_type = $2::text,
        annual_rate_percent = $3::numeric,
        valid_from = $4::date,
        valid_to = $5::date,
        capitalization_period = $6::text,
        notes = $7::text,
        updated_at = now()
      where id = $1::uuid
      `,
      [
        activeRateId,
        rateType,
        annualRatePercent,
        validFrom,
        validTo,
        optionalText(payload.rateCapitalizationPeriod),
        optionalText(payload.rateNotes),
      ],
    );
    return;
  }

  await client.query(
    `
    insert into public.account_rate_periods (
      account_id,
      rate_type,
      annual_rate_percent,
      valid_from,
      valid_to,
      capitalization_period,
      notes
    )
    values ($1::uuid, $2::text, $3::numeric, $4::date, $5::date, $6::text, $7::text)
    `,
    [
      accountId,
      rateType,
      annualRatePercent,
      validFrom,
      validTo,
      optionalText(payload.rateCapitalizationPeriod),
      optionalText(payload.rateNotes),
    ],
  );
}

async function upsertCreditFacility(client: PoolClient, accountId: string, payload: Record<string, unknown>) {
  const existingFacility = await client.query<{ id: string }>(
    `
    select id
    from public.credit_facilities
    where account_id = $1::uuid
    order by created_at desc
    limit 1
    `,
    [accountId],
  );
  const facilityId = existingFacility.rows[0]?.id;

  if (payload.creditFacilityEnabled === false) {
    await client.query("delete from public.credit_facilities where account_id = $1::uuid", [accountId]);
    return;
  }

  const shouldTrackFacility =
    booleanValue(payload.creditFacilityEnabled, false) ||
    Boolean(facilityId) ||
    hasAnyValue([
      payload.facilityType,
      payload.facilityDirection,
      payload.principalAmount,
      payload.currentPrincipal,
      payload.monthlyPayment,
      payload.paymentDay,
      payload.facilityStartDate,
      payload.targetEndDate,
      payload.gracePeriodDays,
      payload.interestRatePercent,
      payload.facilityNotes,
    ]);

  if (!shouldTrackFacility) {
    return;
  }

  const facilityType = enumValue(payload.facilityType, facilityTypes, "Facility type", "OTHER");
  const facilityDirection = enumValue(payload.facilityDirection, facilityDirections, "Facility direction", "BORROWED");
  const values = [
    facilityType,
    facilityDirection,
    nonNegativeNumber(payload.principalAmount, "Principal amount"),
    nonNegativeNumber(payload.currentPrincipal, "Current principal"),
    nonNegativeNumber(payload.monthlyPayment, "Monthly payment"),
    paymentDay(payload.paymentDay),
    optionalDate(payload.facilityStartDate, "Facility start date"),
    optionalDate(payload.targetEndDate, "Facility target end date"),
    nonNegativeInteger(payload.gracePeriodDays, "Grace period days"),
    optionalNumber(payload.interestRatePercent, "Interest rate"),
    optionalText(payload.facilityNotes),
  ] as const;

  if (facilityId) {
    await client.query(
      `
      update public.credit_facilities
      set
        facility_type = $2::text,
        facility_direction = $3::text,
        principal_amount = $4::numeric,
        current_principal = $5::numeric,
        monthly_payment = $6::numeric,
        payment_day = $7::integer,
        start_date = $8::date,
        target_end_date = $9::date,
        grace_period_days = $10::integer,
        interest_rate_percent = $11::numeric,
        notes = $12::text,
        updated_at = now()
      where id = $1::uuid
      `,
      [facilityId, ...values],
    );
    return;
  }

  await client.query(
    `
    insert into public.credit_facilities (
      account_id,
      facility_type,
      facility_direction,
      principal_amount,
      current_principal,
      monthly_payment,
      payment_day,
      start_date,
      target_end_date,
      grace_period_days,
      interest_rate_percent,
      notes
    )
    values ($1::uuid, $2::text, $3::text, $4::numeric, $5::numeric, $6::numeric, $7::integer, $8::date, $9::date, $10::integer, $11::numeric, $12::text)
    `,
    [accountId, ...values],
  );
}

export async function PATCH(request: Request, context: { params: Promise<{ accountId: string }> }) {
  const user = await authenticatedUser();

  if (!user) {
    return jsonError("Authentication required.", 401);
  }

  const pool = createPostgresPool();

  if (!pool) {
    return jsonError("Missing database connection.", 500);
  }

  const { accountId } = await context.params;
  const client = await pool.connect();

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const name = text(payload.name);

    if (!name) {
      throw new Error("Account name is required.");
    }

    await client.query("begin");
    const openingDate = optionalDate(payload.openingDate, "Opening date");
    const targetCloseDate = optionalDate(payload.targetCloseDate, "Target close date");
    const providerPartnerRoleId = await ensurePartnerRole(client, user, payload);
    const accountResult = await client.query<{ id: string }>(
      `
      update public.financial_accounts
      set
        provider_partner_role_id = $3::uuid,
        name = $4::text,
        account_type = $5::text,
        direction = $6::text,
        currency = $7::char(3),
        opening_date = $8::date,
        target_close_date = $9::date,
        account_number_mask = $10::text,
        iban_mask = $11::text,
        credit_limit = $12::numeric,
        include_in_net_worth = $13::boolean,
        notes = $14::text,
        updated_at = now()
      where id = $1::uuid
        and user_id = $2::uuid
      returning id
      `,
      [
        accountId,
        user.dataUserId,
        providerPartnerRoleId,
        name,
        enumValue(payload.accountType, accountTypes, "Account type"),
        enumValue(payload.direction, accountDirections, "Account direction"),
        currencyCode(payload.currency),
        openingDate,
        targetCloseDate,
        optionalText(payload.accountNumberMask),
        optionalText(payload.ibanMask),
        nonNegativeNumber(payload.creditLimit, "Credit limit"),
        booleanValue(payload.includeInNetWorth, true),
        optionalText(payload.notes),
      ],
    );

    if (!accountResult.rows[0]) {
      await client.query("rollback");
      return jsonError("Account not found.", 404);
    }

    await upsertRatePeriod(client, accountId, payload);
    await upsertCreditFacility(client, accountId, payload);
    await client.query("commit");

    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return jsonError(error instanceof Error ? error.message : "Could not update account.");
  } finally {
    client.release();
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ accountId: string }> }) {
  const user = await authenticatedUser();

  if (!user) {
    return jsonError("Authentication required.", 401);
  }

  const pool = createPostgresPool();

  if (!pool) {
    return jsonError("Missing database connection.", 500);
  }

  const { accountId } = await context.params;
  const result = await pool.query<{ id: string }>(
    `
    delete from public.financial_accounts
    where id = $1::uuid
      and user_id = $2::uuid
    returning id
    `,
    [accountId, user.dataUserId],
  );

  if (!result.rows[0]) {
    return jsonError("Account not found.", 404);
  }

  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
