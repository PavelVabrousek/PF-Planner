import { NextResponse } from "next/server";
import { getCurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QueryPayload = {
  sql?: unknown;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

function normalizeSelect(sql: string) {
  const trimmed = sql.trim();

  if (!/^select\b/i.test(trimmed)) {
    throw new Error("Only SELECT statements are allowed.");
  }

  if (trimmed.includes(";")) {
    throw new Error("Semicolons and multiple statements are not allowed.");
  }

  return `select * from (${trimmed}) as debug_query_result limit 1000`;
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

  let payload: QueryPayload;

  try {
    payload = (await request.json()) as QueryPayload;
  } catch {
    return jsonError("Invalid JSON payload.");
  }

  const sql = typeof payload.sql === "string" ? payload.sql : "";

  if (!sql.trim()) {
    return jsonError("SQL query is required.");
  }

  const client = await pool.connect();

  try {
    const guardedSql = normalizeSelect(sql);
    await client.query("begin read only");
    await client.query("set local statement_timeout = '5000ms'");
    const result = await client.query(guardedSql);
    await client.query("commit");

    return NextResponse.json(
      {
        columns: result.fields.map((field) => field.name),
        rows: result.rows,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return jsonError(error instanceof Error ? error.message : "Debug SQL query failed.");
  } finally {
    client.release();
  }
}
