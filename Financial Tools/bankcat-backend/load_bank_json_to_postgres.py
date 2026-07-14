#!/usr/bin/env python3
import argparse
import logging
import os
import re
import time
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Tuple

import ijson
import psycopg

SPACE_RE = re.compile(r"\s+")

COPY_SQL = """
COPY bank_company_categories (
  company_name,
  bank_name,
  category,
  company_name_norm,
  bank_name_norm,
  category_norm,
  search_text,
  search_text_norm,
  source_file
) FROM STDIN
"""


def as_text(value: object) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def norm_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def normalize_text(value: Optional[str]) -> str:
    if not value:
        return ""
    text = value.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = SPACE_RE.sub(" ", text).strip()
    return text


def pick_from_normalized_key_map(norm_map: Dict[str, object], aliases: List[str]) -> Optional[str]:
    for alias in aliases:
        v = as_text(norm_map.get(alias))
        if v:
            return v
    return None


def iter_json_rows(file_path: Path) -> Iterator[Dict[str, object]]:
    prefixes = ["item", "data.item", "records.item"]

    for prefix in prefixes:
        yielded = False
        with file_path.open("rb") as fh:
            for item in ijson.items(fh, prefix):
                if isinstance(item, dict):
                    yielded = True
                    yield item
        if yielded:
            return


def map_row(obj: Dict[str, object], source_file: str) -> Optional[Tuple[object, ...]]:
    norm_map = {norm_key(k): v for k, v in obj.items()}

    company_name = pick_from_normalized_key_map(
        norm_map,
        ["companyname", "company", "employer", "name"],
    )
    bank_name = pick_from_normalized_key_map(
        norm_map,
        ["bankname", "bank", "lender", "financier"],
    )
    category = pick_from_normalized_key_map(
        norm_map,
        ["category", "cat", "segment"],
    )

    if not company_name and not bank_name and not category:
        return None

    company_name = company_name or "-"
    bank_name = bank_name or "-"
    category = category or "-"

    company_name_norm = normalize_text(company_name)
    bank_name_norm = normalize_text(bank_name)
    category_norm = normalize_text(category)
    search_text = f"{company_name} {bank_name} {category}".strip()
    search_text_norm = normalize_text(search_text)

    return (
        company_name,
        bank_name,
        category,
        company_name_norm,
        bank_name_norm,
        category_norm,
        search_text,
        search_text_norm,
        source_file,
    )


def copy_batch(cur: psycopg.Cursor, batch: List[Tuple[object, ...]]) -> None:
    if not batch:
        return
    with cur.copy(COPY_SQL) as copy:
        for row in batch:
            copy.write_row(row)


def load_one_file(cur: psycopg.Cursor, file_path: Path, batch_size: int, log_every: int) -> int:
    batch: List[Tuple[object, ...]] = []
    inserted = 0

    for obj in iter_json_rows(file_path):
        mapped = map_row(obj, file_path.name)
        if not mapped:
            continue

        batch.append(mapped)
        if len(batch) >= batch_size:
            copy_batch(cur, batch)
            inserted += len(batch)
            batch.clear()
            if inserted % log_every == 0:
                logging.info("  %s rows copied so far from %s", inserted, file_path.name)

    if batch:
        copy_batch(cur, batch)
        inserted += len(batch)

    return inserted


def list_json_files(json_dir: Path, pattern: str) -> List[Path]:
    files = sorted(json_dir.glob(pattern))
    if not files:
        files = sorted(json_dir.glob("*.json"))
    return files


def apply_schema(cur: psycopg.Cursor, schema_path: Path) -> None:
    sql_text = schema_path.read_text(encoding="utf-8")
    cur.execute(sql_text)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Load bank category JSON files into PostgreSQL")
    parser.add_argument(
        "--db-url",
        default=os.getenv("DATABASE_URL", ""),
        help="PostgreSQL connection URL (or set DATABASE_URL)",
    )
    parser.add_argument(
        "--json-dir",
        default=str(Path(__file__).resolve().parent.parent / "Bank Company Check Tool's"),
        help="Directory containing Main-data JSON files",
    )
    parser.add_argument(
        "--pattern",
        default="Main-data*.json",
        help="File pattern for JSON files (default: Main-data*.json)",
    )
    parser.add_argument(
        "--schema",
        default=str(Path(__file__).resolve().parent / "schema.sql"),
        help="Path to schema.sql",
    )
    parser.add_argument("--batch-size", type=int, default=10000, help="Rows per COPY batch")
    parser.add_argument("--log-every", type=int, default=200000, help="Progress logging interval")
    parser.add_argument(
        "--no-truncate",
        action="store_true",
        help="Do not truncate table before loading",
    )
    parser.add_argument(
        "--fast",
        action="store_true",
        help="Use faster (less durable) load settings for initial bulk import",
    )
    return parser.parse_args()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")
    args = parse_args()

    if not args.db_url:
        raise SystemExit("Missing --db-url or DATABASE_URL")

    json_dir = Path(args.json_dir)
    schema_path = Path(args.schema)

    if not json_dir.exists() or not json_dir.is_dir():
        raise SystemExit(f"JSON directory not found: {json_dir}")
    if not schema_path.exists():
        raise SystemExit(f"Schema file not found: {schema_path}")

    files = list_json_files(json_dir, args.pattern)
    if not files:
        raise SystemExit(f"No JSON files found in: {json_dir}")

    logging.info("Found %s JSON files", len(files))
    for file in files:
        logging.info("  %s", file.name)

    started = time.time()
    total_inserted = 0

    with psycopg.connect(args.db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout TO 0")
            if args.fast:
                cur.execute("SET synchronous_commit TO OFF")
                cur.execute("SET maintenance_work_mem TO '1GB'")
                cur.execute("SET work_mem TO '128MB'")

            logging.info("Applying schema...")
            apply_schema(cur, schema_path)
            conn.commit()

            if not args.no_truncate:
                logging.info("Truncating existing data...")
                cur.execute("TRUNCATE TABLE bank_company_categories")
                conn.commit()

            for file in files:
                file_start = time.time()
                logging.info("Loading %s ...", file.name)
                inserted = load_one_file(cur, file, batch_size=args.batch_size, log_every=args.log_every)
                conn.commit()
                total_inserted += inserted
                logging.info(
                    "Finished %s | inserted=%s | elapsed=%.1fs",
                    file.name,
                    f"{inserted:,}",
                    time.time() - file_start,
                )

            logging.info("Running ANALYZE for planner stats...")
            cur.execute("ANALYZE bank_company_categories")
            conn.commit()

    logging.info(
        "DONE | total rows inserted=%s | total elapsed=%.1fs",
        f"{total_inserted:,}",
        time.time() - started,
    )


if __name__ == "__main__":
    main()
