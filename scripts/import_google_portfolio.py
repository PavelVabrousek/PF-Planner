from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable
from uuid import UUID


DATE_RE = re.compile(r"^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$")
PERCENT_RE = re.compile(r"^[+-]?\d[\d\s]*(?:,\d+)?\s*%$")
MONEY_RE = re.compile(r"^[+-]?\d[\d\s]*(?:,\d+)?(?:\s*(?:€|\$|zł|CHF|kr\.|Kč))?\s*$")
SYMBOL_RE = re.compile(r"^[A-Z0-9][A-Z0-9.-]{0,15}$")
ICON_LINES = {"trending_up", "equalizer"}

CURRENCY_BY_SYMBOL = {
    "€": "EUR",
    "$": "USD",
    "zł": "PLN",
    "CHF": "CHF",
    "kr.": "DKK",
    "Kč": "CZK",
}


@dataclass(frozen=True)
class AssetBlock:
    symbol: str
    name: str
    current_price: Decimal | None
    currency: str
    quantity: Decimal
    value_czk: Decimal | None
    buys: list["BuyTransaction"]


@dataclass(frozen=True)
class BuyTransaction:
    symbol: str
    asset_name: str
    trade_date: date
    price: Decimal
    quantity: Decimal
    currency: str
    row_hash: str
    source_row: dict[str, str]


def clean_lines(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


def parse_decimal(value: str) -> Decimal:
    normalized = value.strip()
    normalized = normalized.replace("\u00a0", " ")
    normalized = re.sub(r"(€|\$|zł|CHF|kr\.|Kč)", "", normalized)
    normalized = normalized.replace("+", "").replace("%", "").strip()
    normalized = normalized.replace(" ", "").replace(",", ".")
    try:
        return Decimal(normalized)
    except InvalidOperation as exc:
        raise ValueError(f"Cannot parse decimal value: {value!r}") from exc


def parse_date(value: str) -> date:
    match = DATE_RE.match(value.strip())
    if not match:
        raise ValueError(f"Cannot parse Czech date: {value!r}")
    day, month, year = (int(part) for part in match.groups())
    return date(year, month, day)


def infer_currency(value: str, fallback_symbol: str, asset_name: str) -> str:
    for marker, currency in CURRENCY_BY_SYMBOL.items():
        if marker in value:
            return currency
    if fallback_symbol.upper() == "BTC" or "USD" in asset_name.upper():
        return "USD"
    raise ValueError(f"Cannot infer currency from {value!r} for {fallback_symbol}")


def is_numeric_line(value: str) -> bool:
    return bool(MONEY_RE.match(value.strip()))


def is_header_start(lines: list[str], index: int) -> bool:
    if index + 5 >= len(lines):
        return False
    if lines[index] in {
        "SYMBOL",
        "JMÉNO",
        "CENA",
        "MNOŽSTVÍ",
        "HODNOTA",
        "Datum nákupu",
        "Kupní cena",
        "Množství",
        "Celkový zisk",
        "Hodnota",
    }:
        return False
    if SYMBOL_RE.match(lines[index]) is None:
        return False

    cursor = index + 2
    while cursor < len(lines) and lines[cursor] in ICON_LINES:
        cursor += 1

    return (
        cursor + 3 < len(lines)
        and is_numeric_line(lines[cursor])
        and is_numeric_line(lines[cursor + 1])
        and is_numeric_line(lines[cursor + 2])
        and PERCENT_RE.match(lines[cursor + 3]) is not None
    )


def find_next_asset_start(lines: list[str], start: int) -> int:
    for index in range(start, len(lines)):
        if is_header_start(lines, index):
            return index
    return len(lines)


def make_row_hash(symbol: str, trade_date: date, price: Decimal, quantity: Decimal) -> str:
    raw = f"google-portfolio|{symbol}|{trade_date.isoformat()}|{price}|{quantity}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def parse_asset_block(lines: list[str], start: int, end: int) -> AssetBlock:
    symbol = lines[start].upper()
    name = lines[start + 1]
    cursor = start + 2

    while cursor < end and lines[cursor] in ICON_LINES:
        cursor += 1

    current_price_raw = lines[cursor]
    current_price = parse_decimal(current_price_raw)
    currency = infer_currency(current_price_raw, symbol, name)
    quantity = parse_decimal(lines[cursor + 1])
    value_czk = parse_decimal(lines[cursor + 4]) if cursor + 4 < end and "Kč" in lines[cursor + 4] else None

    try:
        buy_header = lines.index("Datum nákupu", cursor, end)
    except ValueError as exc:
        raise ValueError(f"Missing buy transaction header for {symbol}") from exc

    buys: list[BuyTransaction] = []
    row = buy_header + 5
    while row + 4 < end:
        trade_date_raw = lines[row]
        if not DATE_RE.match(trade_date_raw):
            row += 1
            continue

        price_raw = lines[row + 1]
        quantity_raw = lines[row + 2]
        row_currency = infer_currency(price_raw, symbol, name)
        price = parse_decimal(price_raw)
        row_quantity = parse_decimal(quantity_raw)
        trade_date = parse_date(trade_date_raw)
        row_hash = make_row_hash(symbol, trade_date, price, row_quantity)
        buys.append(
            BuyTransaction(
                symbol=symbol,
                asset_name=name,
                trade_date=trade_date,
                price=price,
                quantity=row_quantity,
                currency=row_currency,
                row_hash=row_hash,
                source_row={
                    "date": trade_date_raw,
                    "price": price_raw,
                    "quantity": quantity_raw,
                    "gain": lines[row + 3],
                    "gain_percent": lines[row + 4],
                    "value": lines[row + 5] if row + 5 < end else "",
                },
            )
        )
        row += 6

    return AssetBlock(
        symbol=symbol,
        name=name,
        current_price=current_price,
        currency=currency,
        quantity=quantity,
        value_czk=value_czk,
        buys=buys,
    )


def parse_google_portfolio(text: str) -> list[AssetBlock]:
    lines = clean_lines(text)
    blocks: list[AssetBlock] = []
    cursor = 0

    while cursor < len(lines):
        start = find_next_asset_start(lines, cursor)
        if start >= len(lines):
            break
        end = find_next_asset_start(lines, start + 1)
        blocks.append(parse_asset_block(lines, start, end))
        cursor = end

    return blocks


def validate_uuid(value: str, label: str) -> str:
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"{label} must be a valid UUID") from exc


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_database_connection_config() -> dict[str, str | int]:
    database_url = os.getenv("PFP_SUPABASE_DATABASE_URL")
    if database_url:
        return {"conninfo": database_url}

    project_ref = require_env("PFP_SUPABASE_PROJECT_REF")
    pooler_host = require_env("PFP_SUPABASE_POOLER_HOST")
    password = require_env("PFP_SUPABASE_DB_PASSWORD")

    return {
        "host": pooler_host,
        "port": 5432,
        "dbname": "postgres",
        "user": f"postgres.{project_ref}",
        "password": password,
        "sslmode": "require",
    }


def print_summary(blocks: Iterable[AssetBlock]) -> None:
    total_assets = 0
    total_buys = 0
    for block in blocks:
        total_assets += 1
        total_buys += len(block.buys)
        print(f"{block.symbol:8} {block.currency:3} {block.name} - {len(block.buys)} BUY rows")
        for buy in block.buys:
            print(f"  {buy.trade_date.isoformat()} qty={buy.quantity} price={buy.price} {buy.currency}")
    print(f"\nParsed {total_assets} assets and {total_buys} BUY transactions.")


def write_to_supabase(
    *,
    database_config: dict[str, str | int],
    user_id: str,
    portfolio_name: str,
    base_currency: str,
    blocks: list[AssetBlock],
    file_name: str,
) -> None:
    try:
        import psycopg
        from psycopg.rows import dict_row
        from psycopg.types.json import Jsonb
    except ImportError as exc:
        raise RuntimeError(
            "Missing Python dependency. Install it with: py -m pip install \"psycopg[binary]\""
        ) from exc

    with psycopg.connect(**database_config, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into public.profiles (id, base_currency)
                values (%s, %s)
                on conflict (id) do update
                set base_currency = excluded.base_currency
                returning id
                """,
                (user_id, base_currency),
            )

            cur.execute(
                """
                insert into public.portfolios (user_id, name, base_currency)
                values (%s, %s, %s)
                on conflict (user_id, (lower(name)))
                where is_archived = false
                do update set base_currency = excluded.base_currency
                returning id
                """,
                (user_id, portfolio_name, base_currency),
            )
            portfolio_id = cur.fetchone()["id"]

            source_hash = hashlib.sha256(
                "\n".join(buy.row_hash for block in blocks for buy in block.buys).encode("utf-8")
            ).hexdigest()
            row_count = sum(len(block.buys) for block in blocks)

            cur.execute(
                """
                insert into public.imports (
                  user_id, portfolio_id, source, source_hash, status, file_name, row_count, committed_at
                )
                values (%s, %s, 'PASTE', %s, 'COMMITTED', %s, %s, now())
                on conflict (user_id, source_hash)
                where source_hash is not null
                do update set updated_at = now()
                returning id
                """,
                (user_id, portfolio_id, source_hash, file_name, row_count),
            )
            import_id = cur.fetchone()["id"]

            inserted_transactions = 0
            import_row_number = 0
            for block in blocks:
                cur.execute(
                    """
                    insert into public.assets (
                      symbol, exchange, name, currency, asset_type, data_provider, provider_symbol
                    )
                    values (%s, 'GOOGLE', %s, %s, %s, 'google_finance_paste', %s)
                    on conflict (exchange, symbol)
                    do update set
                      name = excluded.name,
                      currency = excluded.currency,
                      asset_type = excluded.asset_type,
                      data_provider = excluded.data_provider,
                      provider_symbol = excluded.provider_symbol
                    returning id
                    """,
                    (
                        block.symbol,
                        block.name,
                        block.currency,
                        "CRYPTO" if block.symbol == "BTC" else "STOCK",
                        block.symbol,
                    ),
                )
                asset_id = cur.fetchone()["id"]

                for buy in block.buys:
                    import_row_number += 1
                    cur.execute(
                        """
                        insert into public.transactions (
                          portfolio_id, asset_id, type, trade_date, quantity, price,
                          fee, tax, currency, source, external_id, import_id, metadata
                        )
                        values (%s, %s, 'BUY', %s, %s, %s, 0, 0, %s, 'PASTE', %s, %s, %s)
                        on conflict (portfolio_id, source, external_id)
                        where external_id is not null
                        do nothing
                        returning id
                        """,
                        (
                            portfolio_id,
                            asset_id,
                            buy.trade_date,
                            buy.quantity,
                            buy.price,
                            buy.currency,
                            buy.row_hash,
                            import_id,
                            Jsonb(
                                {
                                    "source": "google_portfolio_copy_paste",
                                    "asset_name": buy.asset_name,
                                    "source_row": buy.source_row,
                                }
                            ),
                        ),
                    )
                    transaction = cur.fetchone()
                    transaction_id = transaction["id"] if transaction else None
                    if transaction_id:
                        inserted_transactions += 1

                    cur.execute(
                        """
                        insert into public.import_rows (
                          import_id, row_number, status, raw_data, parsed_data, transaction_id
                        )
                        values (%s, %s, 'COMMITTED', %s, %s, %s)
                        on conflict (import_id, row_number)
                        do update set
                          status = excluded.status,
                          raw_data = excluded.raw_data,
                          parsed_data = excluded.parsed_data,
                          transaction_id = excluded.transaction_id
                        """,
                        (
                            import_id,
                            import_row_number,
                            Jsonb(buy.source_row),
                            Jsonb(
                                {
                                    "symbol": buy.symbol,
                                    "trade_date": buy.trade_date.isoformat(),
                                    "quantity": str(buy.quantity),
                                    "price": str(buy.price),
                                    "currency": buy.currency,
                                }
                            ),
                            transaction_id,
                        ),
                    )

        conn.commit()

    print(f"Committed import {import_id} into portfolio {portfolio_id}.")
    print(f"Inserted {inserted_transactions} new transactions; duplicates were skipped.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Import BUY rows from a Google Portfolio copy/paste text export into Supabase."
    )
    parser.add_argument(
        "--file",
        default="GooglePortfolioCopyPaste.txt",
        help="Path to the Google Portfolio copy/paste text file.",
    )
    parser.add_argument(
        "--user-id",
        default=os.getenv("PFP_SUPABASE_USER_ID"),
        help="Existing Supabase auth.users UUID. Can also be set as PFP_SUPABASE_USER_ID.",
    )
    parser.add_argument(
        "--portfolio-name",
        default=os.getenv("PFP_PORTFOLIO_NAME", "Google Portfolio Import"),
        help="Portfolio name to create or reuse.",
    )
    parser.add_argument(
        "--base-currency",
        default=os.getenv("PFP_BASE_CURRENCY", "CZK"),
        help="Portfolio base currency.",
    )
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Write to Supabase. Without this flag the script only prints a dry-run summary.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    input_path = Path(args.file)
    if not input_path.exists():
        parser.error(f"Input file not found: {input_path}")

    text = input_path.read_text(encoding="utf-8-sig")
    blocks = parse_google_portfolio(text)
    if not blocks:
        parser.error("No asset blocks were parsed from the input file.")

    print_summary(blocks)

    if not args.commit:
        print("\nDry run only. Re-run with --commit to write to Supabase.")
        return 0

    if not args.user_id:
        parser.error("--user-id or PFP_SUPABASE_USER_ID is required when using --commit.")

    user_id = validate_uuid(args.user_id, "--user-id")
    database_config = get_database_connection_config()

    write_to_supabase(
        database_config=database_config,
        user_id=user_id,
        portfolio_name=args.portfolio_name,
        base_currency=args.base_currency.upper(),
        blocks=blocks,
        file_name=input_path.name,
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
