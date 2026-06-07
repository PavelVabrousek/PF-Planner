import { NextResponse } from "next/server";
import { getCurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RowPayload = {
  table?: unknown;
  key?: unknown;
  updates?: unknown;
};

type ColumnRow = {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
};

type KeyRow = {
  column_name: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function publicTables() {
  const pool = createPostgresPool();

  if (!pool) {
    throw new Error("Missing database connection.");
  }

  const result = await pool.query<{ table_name: string }>(
    `
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name
    `,
  );

  return result.rows.map((row) => row.table_name);
}

async function tableColumns(table: string) {
  const pool = createPostgresPool();

  if (!pool) {
    throw new Error("Missing database connection.");
  }

  const result = await pool.query<ColumnRow>(
    `
    select column_name, data_type, udt_name, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = $1
    order by ordinal_position
    `,
    [table],
  );

  return result.rows.map((row) => ({
    name: row.column_name,
    dataType: row.data_type,
    udtName: row.udt_name,
    nullable: row.is_nullable === "YES",
  }));
}

async function tableKeyColumns(table: string) {
  const pool = createPostgresPool();

  if (!pool) {
    throw new Error("Missing database connection.");
  }

  const primary = await pool.query<KeyRow>(
    `
    select a.attname as column_name
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(i.indkey)
    where n.nspname = 'public'
      and t.relname = $1
      and i.indisprimary
    order by array_position(i.indkey, a.attnum)
    `,
    [table],
  );

  if (primary.rows.length > 0) {
    return primary.rows.map((row) => row.column_name);
  }

  const uniqueIndex = await pool.query<{ indexrelid: string }>(
    `
    select i.indexrelid::text
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = $1
      and i.indisunique
      and i.indpred is null
      and i.indexprs is null
    order by i.indexrelid
    limit 1
    `,
    [table],
  );

  const indexrelid = uniqueIndex.rows[0]?.indexrelid;

  if (!indexrelid) {
    return [];
  }

  const unique = await pool.query<KeyRow>(
    `
    select a.attname as column_name
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(i.indkey)
    where i.indexrelid = $1::oid
    order by array_position(i.indkey, a.attnum)
    `,
    [indexrelid],
  );

  return unique.rows.map((row) => row.column_name);
}

function parseValue(
  value: unknown,
  column: { name: string; dataType: string; udtName: string; nullable: boolean },
) {
  if (value === null) {
    if (!column.nullable) {
      throw new Error(`${column.name} cannot be NULL.`);
    }

    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (column.dataType === "boolean") {
    if (/^(true|t|1|yes)$/i.test(trimmed)) {
      return true;
    }

    if (/^(false|f|0|no)$/i.test(trimmed)) {
      return false;
    }

    throw new Error(`${column.name} must be a boolean.`);
  }

  if (
    [
      "bigint",
      "double precision",
      "integer",
      "numeric",
      "real",
      "smallint",
    ].includes(column.dataType)
  ) {
    if (!trimmed || Number.isNaN(Number(trimmed))) {
      throw new Error(`${column.name} must be numeric.`);
    }

    return trimmed;
  }

  if (column.udtName === "json" || column.udtName === "jsonb") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${column.name} must contain valid JSON.`);
    }
  }

  return value;
}

export async function PATCH(request: Request) {
  const auth = await getCurrentPfpUser();

  if (auth.status !== "authenticated") {
    return jsonError(auth.message, auth.status === "forbidden" ? 403 : 401);
  }

  const pool = createPostgresPool();

  if (!pool) {
    return jsonError("Missing database connection.", 503);
  }

  let payload: RowPayload;

  try {
    payload = (await request.json()) as RowPayload;
  } catch {
    return jsonError("Invalid JSON payload.");
  }

  const table = typeof payload.table === "string" ? payload.table.trim() : "";

  if (!table) {
    return jsonError("Table is required.");
  }

  if (!isRecord(payload.key) || !isRecord(payload.updates)) {
    return jsonError("Key and updates are required.");
  }

  const keyRecord = payload.key;
  const updateRecord = payload.updates;

  try {
    const tables = await publicTables();

    if (!tables.includes(table)) {
      return jsonError("Unknown public table.", 404);
    }

    const columns = await tableColumns(table);
    const columnMap = new Map(columns.map((column) => [column.name, column]));
    const keyColumns = await tableKeyColumns(table);

    if (keyColumns.length === 0) {
      return jsonError("This table has no primary or stable unique key.");
    }

    const missingKey = keyColumns.find((column) => !(column in keyRecord));

    if (missingKey) {
      return jsonError(`Missing key column ${missingKey}.`);
    }

    const updateEntries = Object.entries(updateRecord).filter(
      ([column]) => columnMap.has(column) && !keyColumns.includes(column),
    );

    if (updateEntries.length === 0) {
      return jsonError("No editable columns were provided.");
    }

    const values: unknown[] = [];
    const setSql = updateEntries
      .map(([column, value], index) => {
        const columnInfo = columnMap.get(column);

        if (!columnInfo) {
          throw new Error(`Unknown column ${column}.`);
        }

        values.push(parseValue(value, columnInfo));
        return `${quoteIdentifier(column)} = $${index + 1}`;
      })
      .join(", ");

    const whereSql = keyColumns
      .map((column, index) => {
        values.push(keyRecord[column]);
        return `${quoteIdentifier(column)} = $${updateEntries.length + index + 1}`;
      })
      .join(" and ");

    const result = await pool.query(
      `
      update public.${quoteIdentifier(table)}
      set ${setSql}
      where ${whereSql}
      returning *
      `,
      values,
    );

    if (result.rowCount !== 1) {
      return jsonError("The selected row could not be updated.", 409);
    }

    return NextResponse.json(
      {
        columns: result.fields.map((field) => field.name),
        rows: result.rows,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Debug row update failed.");
  }
}
