import { NextResponse } from "next/server";
import { getCurrentPfpUser } from "@/lib/auth/current-user";
import { createPostgresPool } from "@/lib/db/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TableRow = {
  table_name: string;
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

async function publicTables() {
  const pool = createPostgresPool();

  if (!pool) {
    throw new Error("Missing database connection.");
  }

  const result = await pool.query<TableRow>(
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

  const unique = await pool.query<KeyRow>(
    `
    select a.attname as column_name
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(i.indkey)
    where n.nspname = 'public'
      and t.relname = $1
      and i.indisunique
      and i.indpred is null
      and i.indexprs is null
    order by i.indexrelid, array_position(i.indkey, a.attnum)
    limit 16
    `,
    [table],
  );

  return unique.rows.map((row) => row.column_name);
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

  const url = new URL(request.url);
  const selectedTable = url.searchParams.get("table")?.trim();

  try {
    const tables = await publicTables();

    if (!selectedTable) {
      return NextResponse.json({ tables }, { headers: { "cache-control": "no-store" } });
    }

    if (!tables.includes(selectedTable)) {
      return jsonError("Unknown public table.", 404);
    }

    const rowsResult = await pool.query(
      `select * from public.${quoteIdentifier(selectedTable)} limit 1000`,
    );
    const columns = await tableColumns(selectedTable);
    const keyColumns = await tableKeyColumns(selectedTable);

    return NextResponse.json(
      {
        tables,
        table: selectedTable,
        columns: columns.map((column) => column.name),
        columnInfo: columns,
        keyColumns,
        rows: rowsResult.rows,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Debug table query failed.", 500);
  }
}
