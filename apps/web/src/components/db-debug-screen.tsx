"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, Loader2, Play, Save, Table2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type DebugMode = "data" | "sql";
type SortState = {
  column: string;
  direction: "asc" | "desc";
} | null;

type ColumnInfo = {
  name: string;
  dataType: string;
  udtName: string;
  nullable: boolean;
};

type DebugResponse = {
  tables?: string[];
  table?: string;
  columns?: string[];
  columnInfo?: ColumnInfo[];
  keyColumns?: string[];
  rows?: Record<string, unknown>[];
  error?: string;
};

function tableSql(table: string) {
  return table ? `select * from public."${table.replaceAll('"', '""')}" limit 1000` : "";
}

function quotedIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quotedTableName(table: string) {
  return `public.${quotedIdentifier(table)}`;
}

function valueText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function editText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function csvCell(value: unknown) {
  const text = valueText(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function defaultColumnWidth(column: string) {
  return Math.min(Math.max(column.length * 10 + 48, 110), 260);
}

function rowIdentity(row: Record<string, unknown>, keyColumns: string[]) {
  if (keyColumns.length === 0) {
    return "";
  }

  return JSON.stringify(keyColumns.map((column) => [column, row[column] ?? null]));
}

function rowKey(row: Record<string, unknown>, keyColumns: string[]) {
  return Object.fromEntries(keyColumns.map((column) => [column, row[column] ?? null]));
}

function parseEditableValue(text: string, isNull: boolean, column?: ColumnInfo) {
  if (isNull) {
    return null;
  }

  if (!column || (column.udtName !== "json" && column.udtName !== "jsonb")) {
    return text;
  }

  return text.trim() ? JSON.parse(text) : {};
}

export function DbDebugScreen() {
  const sqlTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedRowIdRef = useRef("");
  const selectedRowAtRef = useRef(0);
  const [mode, setMode] = useState<DebugMode>("data");
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedTableColumns, setSelectedTableColumns] = useState<string[]>([]);
  const [selectedTableColumnInfo, setSelectedTableColumnInfo] = useState<ColumnInfo[]>([]);
  const [selectedTableKeyColumns, setSelectedTableKeyColumns] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [columnInfo, setColumnInfo] = useState<ColumnInfo[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortState>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [sql, setSql] = useState("");
  const [selectedRowId, setSelectedRowId] = useState("");
  const [detailRowId, setDetailRowId] = useState("");
  const [selectedRowSnapshot, setSelectedRowSnapshot] = useState<Record<string, unknown> | null>(null);
  const [detailRowSnapshot, setDetailRowSnapshot] = useState<Record<string, unknown> | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [draftNulls, setDraftNulls] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const columnInfoByName = useMemo(
    () => new Map(columnInfo.map((column) => [column.name, column])),
    [columnInfo],
  );
  const selectedTableColumnInfoByName = useMemo(
    () => new Map(selectedTableColumnInfo.map((column) => [column.name, column])),
    [selectedTableColumnInfo],
  );

  const editableKeyColumns = useMemo(
    () =>
      selectedTable.length > 0 &&
      selectedTableKeyColumns.length > 0 &&
      selectedTableKeyColumns.every((column) => columns.includes(column))
        ? selectedTableKeyColumns
        : [],
    [columns, selectedTable, selectedTableKeyColumns],
  );

  const detailRow = detailRowSnapshot && detailRowId ? detailRowSnapshot : null;
  const selectedRow = selectedRowSnapshot && selectedRowId ? selectedRowSnapshot : null;
  const canEditDetail = selectedTable.length > 0 && editableKeyColumns.length > 0 && Boolean(detailRow);

  useEffect(() => {
    let isCancelled = false;
    setStatus("loading");

    fetch("/api/debug-db/tables")
      .then(async (response) => {
        const payload = (await response.json()) as DebugResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "Tables could not be loaded.");
        }

        return payload.tables ?? [];
      })
      .then((tableNames) => {
        if (isCancelled) {
          return;
        }

        const firstTable = tableNames[0] ?? "";
        setTables(tableNames);
        setSelectedTable(firstTable);
        setSql(tableSql(firstTable));
        setStatus("idle");
      })
      .catch((caughtError) => {
        if (!isCancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Tables could not be loaded.");
          setStatus("error");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== "data" || !selectedTable) {
      return;
    }

    let isCancelled = false;
    setStatus("loading");
    setError(null);
    clearGridSelection();
    setDetailRowId("");

    fetch(`/api/debug-db/tables?table=${encodeURIComponent(selectedTable)}`)
      .then(async (response) => {
        const payload = (await response.json()) as DebugResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "Table rows could not be loaded.");
        }

        return payload;
      })
      .then((payload) => {
        if (isCancelled) {
          return;
        }

        setColumns(payload.columns ?? []);
        setColumnInfo(payload.columnInfo ?? []);
        setSelectedTableColumns(payload.columns ?? []);
        setSelectedTableColumnInfo(payload.columnInfo ?? []);
        setSelectedTableKeyColumns(payload.keyColumns ?? []);
        setRows(payload.rows ?? []);
        setFilters({});
        setSort(null);
        setColumnWidths({});
        setStatus("idle");
      })
      .catch((caughtError) => {
        if (!isCancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Table rows could not be loaded.");
          setStatus("error");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [mode, selectedTable]);

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) =>
      columns.every((column) => {
        const filter = filters[column]?.trim().toLowerCase();

        if (!filter) {
          return true;
        }

        return valueText(row[column]).toLowerCase().includes(filter);
      }),
    );

    if (!sort) {
      return filtered;
    }

    return [...filtered].sort((left, right) => {
      const leftValue = valueText(left[sort.column]);
      const rightValue = valueText(right[sort.column]);
      const order = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });

      return sort.direction === "asc" ? order : -order;
    });
  }, [columns, filters, rows, sort]);

  async function runSql() {
    setMode("sql");
    setStatus("loading");
    setError(null);
    clearGridSelection();
    setDetailRowId("");
    setDraftValues({});
    setDraftNulls({});

    try {
      const response = await fetch("/api/debug-db/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const payload = (await response.json()) as DebugResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "SQL query failed.");
      }

      setColumns(payload.columns ?? []);
      setColumnInfo([]);
      setRows(payload.rows ?? []);
      setFilters({});
      setSort(null);
      setColumnWidths({});
      setStatus("idle");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "SQL query failed.");
      setStatus("error");
    }
  }

  function selectTable(table: string) {
    setMode("data");
    setSelectedTable(table);
    setSql(tableSql(table));
  }

  async function selectTableForSqlBuilder(table: string) {
    setSelectedTable(table);
    setError(null);

    try {
      const response = await fetch(`/api/debug-db/tables?table=${encodeURIComponent(table)}`);
      const payload = (await response.json()) as DebugResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Table columns could not be loaded.");
      }

      setSelectedTableColumns(payload.columns ?? []);
      setSelectedTableColumnInfo(payload.columnInfo ?? []);
      setSelectedTableKeyColumns(payload.keyColumns ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Table columns could not be loaded.");
    }
  }

  function insertSqlText(text: string) {
    if (mode !== "sql") {
      return;
    }

    const textarea = sqlTextareaRef.current;
    const start = textarea?.selectionStart ?? sql.length;
    const end = textarea?.selectionEnd ?? start;
    const nextSql = `${sql.slice(0, start)}${text}${sql.slice(end)}`;
    const nextCursor = start + text.length;

    setSql(nextSql);
    window.requestAnimationFrame(() => {
      sqlTextareaRef.current?.focus();
      sqlTextareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function exportCsv() {
    const csv = [
      columns.map(csvCell).join(","),
      ...visibleRows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${mode === "data" ? selectedTable : "debug-query"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function toggleSort(column: string) {
    setSort((current) => {
      if (current?.column !== column) {
        return { column, direction: "asc" };
      }

      if (current.direction === "asc") {
        return { column, direction: "desc" };
      }

      return null;
    });
  }

  function clearGridSelection() {
    selectedRowIdRef.current = "";
    selectedRowAtRef.current = 0;
    setSelectedRowId("");
    setSelectedRowSnapshot(null);
  }

  function selectGridRow(identity: string, row: Record<string, unknown>) {
    if (selectedRowIdRef.current !== identity) {
      selectedRowIdRef.current = identity;
      selectedRowAtRef.current = Date.now();
    }

    setSelectedRowSnapshot(row);
    setSelectedRowId(identity);
  }

  function openDetail(identity: string, row: Record<string, unknown>) {
    if (!identity) {
      return;
    }

    setSelectedRowId(identity);
    setDetailRowId(identity);
    setSelectedRowSnapshot(row);
    setDetailRowSnapshot(row);
    setDraftValues(Object.fromEntries(columns.map((column) => [column, editText(row[column])])));
    setDraftNulls(Object.fromEntries(columns.map((column) => [column, row[column] === null || row[column] === undefined])));
    setSaveStatus("idle");
    setSaveError(null);
  }

  async function saveDetail() {
    if (!detailRow || !canEditDetail) {
      return;
    }

    setSaveStatus("saving");
    setSaveError(null);

    try {
      const updates = Object.fromEntries(
        columns
          .filter((column) => selectedTableColumns.includes(column) && !editableKeyColumns.includes(column))
          .map((column) => [
            column,
            parseEditableValue(
              draftValues[column] ?? "",
              draftNulls[column] ?? false,
              selectedTableColumnInfoByName.get(column) ?? columnInfoByName.get(column),
            ),
          ]),
      );

      const response = await fetch("/api/debug-db/row", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          table: selectedTable,
          key: rowKey(detailRow, editableKeyColumns),
          updates,
        }),
      });
      const payload = (await response.json()) as DebugResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Row could not be saved.");
      }

      const updatedRow = payload.rows?.[0];

      if (!updatedRow) {
        throw new Error("Save succeeded but no row was returned.");
      }

      setRows((currentRows) =>
        currentRows.map((row) =>
          editableKeyColumns.length > 0 && rowIdentity(row, editableKeyColumns) === detailRowId ? updatedRow : row,
        ),
      );
      const updatedId = rowIdentity(updatedRow, editableKeyColumns);
      selectedRowIdRef.current = updatedId;
      selectedRowAtRef.current = Date.now();
      setSelectedRowId(updatedId);
      setDetailRowId(updatedId);
      setSelectedRowSnapshot(updatedRow);
      setDetailRowSnapshot(updatedRow);
      setDraftValues(Object.fromEntries(columns.map((column) => [column, editText(updatedRow[column])])));
      setDraftNulls(
        Object.fromEntries(columns.map((column) => [column, updatedRow[column] === null || updatedRow[column] === undefined])),
      );
      setSaveStatus("idle");
    } catch (caughtError) {
      setSaveError(caughtError instanceof Error ? caughtError.message : "Row could not be saved.");
      setSaveStatus("error");
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 py-3">
      <div className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Table2 size={16} className="text-blue-300" />
            <h2 className="whitespace-nowrap text-sm font-semibold text-slate-50">Debug DB mode</h2>
            <fieldset className="flex items-center gap-1 rounded-md border border-white/10 bg-background/60 p-1">
              <legend className="sr-only">Debug DB display mode</legend>
              {(["data", "sql"] satisfies DebugMode[]).map((item) => (
                <label
                  key={item}
                  className={cn(
                    "flex h-7 cursor-pointer items-center gap-1.5 rounded px-2 text-xs font-medium",
                    mode === item ? "bg-neutral/20 text-blue-200" : "text-slate-500 hover:text-slate-200",
                  )}
                >
                  <input
                    type="radio"
                    name="debug-db-mode"
                    checked={mode === item}
                    onChange={() => {
                      setMode(item);
                      if (item === "data") {
                        setSql(tableSql(selectedTable));
                      }
                    }}
                    className="h-3 w-3 accent-blue-400"
                  />
                  {item === "data" ? "Table View" : "SQL Select"}
                </label>
              ))}
            </fieldset>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void runSql()}
              disabled={mode !== "sql"}
              className="flex h-8 items-center justify-center gap-2 rounded-md bg-neutral px-3 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-surface disabled:text-slate-500"
            >
              <Play size={14} />
              Run
            </button>
            <button
              type="button"
              onClick={exportCsv}
              aria-label="Export visible rows to CSV"
              disabled={columns.length === 0}
              className="flex h-8 items-center gap-2 rounded-md border border-white/10 px-3 text-xs font-medium text-slate-300 hover:border-neutral/50 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={14} />
              CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(130px,25%)_minmax(130px,25%)_minmax(0,1fr)] gap-3">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500">Tables</span>
              <span className="text-[10px] text-slate-600">{tables.length} available</span>
            </div>
            <div className="h-[168px] overflow-y-auto rounded-md border border-white/10 bg-background/70 p-1">
              {tables.map((table) => (
                <button
                  key={table}
                  type="button"
                  onClick={() => {
                    if (mode === "sql") {
                      void selectTableForSqlBuilder(table);
                    } else {
                      selectTable(table);
                    }
                  }}
                  onDoubleClick={() => insertSqlText(quotedTableName(table))}
                  className={cn(
                    "block h-[18px] w-full truncate rounded px-1.5 text-left font-mono text-[10px] leading-[18px]",
                    selectedTable === table
                      ? "bg-neutral/20 text-blue-100"
                      : "text-slate-400 hover:bg-surface hover:text-slate-100",
                  )}
                  title={table}
                >
                  {table}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500">Columns</span>
              <span className="text-[10px] text-slate-600">{selectedTableColumns.length} available</span>
            </div>
            <div className="h-[168px] overflow-y-auto rounded-md border border-white/10 bg-background/70 p-1">
              {selectedTableColumns.length > 0 ? (
                selectedTableColumns.map((column) => (
                  <button
                    key={column}
                    type="button"
                    onDoubleClick={() => insertSqlText(quotedIdentifier(column))}
                    className="block h-[18px] w-full truncate rounded px-1.5 text-left font-mono text-[10px] leading-[18px] text-slate-400 hover:bg-surface hover:text-slate-100"
                    title={selectedTableColumnInfoByName.get(column)?.dataType ?? column}
                  >
                    {column}
                  </button>
                ))
              ) : (
                <div className="px-2 py-3 text-xs text-slate-600">No columns</div>
              )}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500">SQL command</span>
              <span className="text-[10px] text-slate-600">Result cap 1000 rows</span>
            </div>
            <textarea
              ref={sqlTextareaRef}
              value={sql}
              onChange={(event) => setSql(event.target.value)}
              readOnly={mode === "data"}
              spellCheck={false}
              className={cn(
                "h-[168px] w-full resize-none rounded-md border border-white/10 bg-background p-2 font-mono text-xs text-slate-100 outline-none focus:border-neutral/60",
                mode === "data" ? "text-slate-500" : "",
              )}
            />
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-white/10 bg-panel p-3 shadow-panel">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
              {mode === "data" ? "Table View" : "SQL Select"}
            </p>
            <h1 className="text-sm font-semibold text-slate-50">
              {mode === "data" ? selectedTable || "Select a table" : "Query result"}
            </h1>
          </div>
          <div className="text-[11px] text-slate-500">
            {editableKeyColumns.length > 0
              ? `Editable key: ${editableKeyColumns.join(", ")}`
              : "Rows can be inspected; Save requires selected table key columns in the result"}
          </div>
        </div>

        <div className="overflow-auto rounded-md border border-white/10">
          <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
            <thead className="sticky top-0 z-10 bg-background text-slate-400">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    style={{ width: columnWidths[column] ?? defaultColumnWidth(column) }}
                    className="relative border-b border-r border-white/10 px-2 py-1 align-top font-medium last:border-r-0"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className="flex w-full items-center justify-between gap-2 text-left hover:text-slate-100"
                      title={`Sort by ${column}`}
                      aria-label={`Sort by ${column}`}
                    >
                      <span className="min-w-0 truncate">{column}</span>
                      <span className="flex shrink-0 items-center gap-0.5 text-slate-600">
                        <ArrowUp
                          size={10}
                          className={cn(
                            "transition-colors",
                            sort?.column === column && sort.direction === "asc" ? "text-blue-300" : "",
                          )}
                          aria-hidden="true"
                        />
                        <ArrowDown
                          size={10}
                          className={cn(
                            "transition-colors",
                            sort?.column === column && sort.direction === "desc" ? "text-blue-300" : "",
                          )}
                          aria-hidden="true"
                        />
                      </span>
                    </button>
                    <input
                      value={filters[column] ?? ""}
                      onChange={(event) => setFilters((current) => ({ ...current, [column]: event.target.value }))}
                      placeholder="Filter"
                      className="mt-1 h-6 w-full rounded border border-white/10 bg-panel px-1.5 text-[10px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-neutral/50"
                    />
                    <input
                      type="range"
                      min={80}
                      max={420}
                      value={columnWidths[column] ?? defaultColumnWidth(column)}
                      onChange={(event) =>
                        setColumnWidths((current) => ({ ...current, [column]: Number(event.target.value) }))
                      }
                      className="mt-1 h-1 w-full accent-blue-400"
                      aria-label={`Width for ${column}`}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {status === "loading" ? (
                <tr>
                  <td colSpan={Math.max(columns.length, 1)} className="px-3 py-8 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Loading
                    </span>
                  </td>
                </tr>
              ) : visibleRows.length > 0 ? (
                visibleRows.map((row, index) => {
                  const identity =
                    editableKeyColumns.length > 0 ? rowIdentity(row, editableKeyColumns) : `query-row:${index}`;
                  const isSelected = identity === selectedRowId;

                  return (
                    <tr
                      key={identity || index}
                      onClick={() => selectGridRow(identity, row)}
                      onDoubleClick={() => {
                        if (
                          identity &&
                          identity === selectedRowIdRef.current &&
                          Date.now() - selectedRowAtRef.current > 450
                        ) {
                          openDetail(identity, row);
                        } else {
                          selectGridRow(identity, row);
                        }
                      }}
                      className={cn(
                        "cursor-default odd:bg-surface/30 hover:bg-neutral/10",
                        isSelected ? "bg-red-950/70 text-red-50 odd:bg-red-950/70 hover:bg-red-950/80" : "",
                      )}
                    >
                      {columns.map((column) => (
                        <td
                          key={column}
                          style={{ maxWidth: columnWidths[column] ?? defaultColumnWidth(column) }}
                          className={cn(
                            "border-b border-r border-white/5 px-2 py-1 font-mono tabular text-slate-300 last:border-r-0",
                            isSelected ? "text-red-50" : "",
                          )}
                          title={valueText(row[column])}
                        >
                          <div className="truncate">{valueText(row[column]) || "NULL"}</div>
                        </td>
                      ))}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={Math.max(columns.length, 1)} className="px-3 py-8 text-center text-slate-500">
                    No rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            Showing {visibleRows.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")} loaded rows.
          </span>
          <span>{selectedRow ? "Double-click selected row for details." : "Select a row to inspect details."}</span>
        </div>
      </div>

      {detailRow ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3">
          <section className="flex max-h-[86vh] w-full max-w-4xl flex-col rounded-lg border border-white/10 bg-panel shadow-panel">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{selectedTable}</p>
                <h2 className="text-sm font-semibold text-slate-50">Record detail / edit</h2>
              </div>
              <button
                type="button"
                onClick={() => setDetailRowId("")}
                aria-label="Close record detail edit"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-auto p-3">
              <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
                <thead className="bg-background text-slate-400">
                  <tr>
                    <th className="border-b border-r border-white/10 px-2 py-1">Column</th>
                    <th className="border-b border-r border-white/10 px-2 py-1">Type</th>
                    <th className="border-b border-r border-white/10 px-2 py-1">NULL</th>
                    <th className="border-b border-white/10 px-2 py-1">Value</th>
                  </tr>
                </thead>
                <tbody>
	                  {columns.map((column) => {
	                    const info = selectedTableColumnInfoByName.get(column) ?? columnInfoByName.get(column);
	                    const isKey = editableKeyColumns.includes(column);
	                    const isNull = draftNulls[column] ?? false;
	                    const editable = canEditDetail && !isKey;

                    return (
                      <tr key={column} className={cn("odd:bg-surface/30", isKey ? "bg-neutral/10" : "")}>
                        <td className="w-48 border-b border-r border-white/5 px-2 py-1 font-mono text-slate-200">
                          {column}
                          {isKey ? <span className="ml-2 text-[10px] text-blue-300">key</span> : null}
                        </td>
                        <td className="w-44 border-b border-r border-white/5 px-2 py-1 text-slate-500">
                          {info ? `${info.dataType}${info.nullable ? "" : " not null"}` : "-"}
                        </td>
                        <td className="w-20 border-b border-r border-white/5 px-2 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={isNull}
                            disabled={!editable || !info?.nullable}
                            onChange={(event) =>
                              setDraftNulls((current) => ({ ...current, [column]: event.target.checked }))
                            }
                            className="h-3.5 w-3.5 accent-blue-400 disabled:opacity-40"
                            aria-label={`${column} is null`}
                          />
                        </td>
                        <td className="border-b border-white/5 px-2 py-1">
                          <textarea
                            value={draftValues[column] ?? ""}
                            disabled={!editable || isNull}
                            onChange={(event) =>
                              setDraftValues((current) => ({ ...current, [column]: event.target.value }))
                            }
                            className="min-h-8 w-full rounded border border-white/10 bg-background px-2 py-1 font-mono text-xs text-slate-100 outline-none focus:border-neutral/60 disabled:text-slate-500"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {saveError ? (
              <div className="mx-3 mb-3 rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-red-200">
                {saveError}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3 text-[11px] text-slate-500">
              <span>
	                {canEditDetail
	                  ? "Key columns are locked; selected-table non-key values can be saved."
	                  : "Save is unavailable because this result does not include a primary-key address for the selected table."}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetailRowId("")}
                  className="h-8 rounded-md border border-white/10 px-3 text-xs font-medium text-slate-300 hover:text-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void saveDetail()}
                  disabled={!canEditDetail || saveStatus === "saving"}
                  className="flex h-8 items-center gap-2 rounded-md bg-neutral px-3 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-surface disabled:text-slate-500"
                >
                  {saveStatus === "saving" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
