"""Fetch one earnings call with Parquet HTTP range reads, not a full download."""

import os
import json
from pathlib import Path
from functools import lru_cache
from time import time
from threading import Lock

import duckdb

TRANSCRIPTS_URL = (
    "https://huggingface.co/datasets/defeatbeta/yahoo-finance-data/resolve/main/"
    "data/US/stock_earning_call_transcripts.parquet"
)
# One Parquet reader fits the instance memory limit; more concurrency needs more RAM.
_query_lock = Lock()
_connection = None
_connection_hour = None
COVERAGE_SQL = """SELECT fiscal_year, fiscal_quarter, report_date FROM read_parquet(?)
    WHERE symbol = ? AND fiscal_year IS NOT NULL AND fiscal_quarter BETWEEN 1 AND 4
      AND (report_date IS NULL OR TRY_CAST(report_date AS DATE) <= CURRENT_DATE)
    ORDER BY fiscal_year DESC, fiscal_quarter DESC"""


def _close_connection():
    global _connection, _connection_hour
    connection, _connection = _connection, None
    _connection_hour = None
    if connection is not None:
        try:
            connection.close()
        except duckdb.Error:
            pass


def _read_rows(sql, parameters, hour, timeout, retries):
    global _connection, _connection_hour
    with _query_lock:
        try:
            if _connection is None or _connection_hour != hour:
                _close_connection()
                config = {"memory_limit": "128MB", "threads": "1"}
                if os.getenv("DUCKDB_EXTENSION_DIRECTORY"):
                    config["extension_directory"] = os.environ["DUCKDB_EXTENSION_DIRECTORY"]
                _connection = duckdb.connect(":memory:", config=config)
                # Keep native range/metadata caches across calls; expire the mutable source hourly.
                _connection.execute("SET enable_external_file_cache=true")
                _connection.execute("SET enable_http_metadata_cache=true")
                _connection.execute("SET parquet_metadata_cache=true")
                _connection_hour = hour
            _connection.execute(f"SET http_timeout={timeout}")
            _connection.execute(f"SET http_retries={retries}")
            return _connection.execute(sql, parameters).fetchall()
        except duckdb.Error:
            _close_connection()
            raise


@lru_cache(maxsize=1)
def company_catalog():
    return json.loads(Path(__file__).with_name("transcript_companies.json").read_text(encoding="utf-8"))["companies"]


def search_companies(query: str) -> list[dict]:
    """Autocomplete only companies present in the transcript archive."""
    query = query.strip().casefold()
    if not query:
        return []
    matches = [item for item in company_catalog() if query in item["symbol"].casefold() or query in item["name"].casefold()]
    return sorted(matches, key=lambda item: (item["symbol"].casefold() != query, not item["symbol"].casefold().startswith(query), item["symbol"]))[:8]


def available_calls(ticker: str) -> list[dict]:
    """Read only the small period/date columns; refresh coverage at least hourly."""
    return [dict(year=year, quarter=quarter, call_date=call_date) for year, quarter, call_date in _available_calls(ticker.upper(), int(time() // 3600))]


@lru_cache(maxsize=128)
def _available_calls(ticker, hour):
    try:
        rows = _read_rows(COVERAGE_SQL, [TRANSCRIPTS_URL, ticker], hour, timeout=10, retries=0)
    except duckdb.Error as exc:
        raise RuntimeError("Transcript coverage could not be checked right now.") from exc
    return tuple((int(year), int(quarter), str(call_date) if call_date else None) for year, quarter, call_date in rows)


def fetch_transcript(ticker: str, year: int, quarter: int) -> dict | None:
    # Keep a fetched call through AI failures so a retry doesn't scan Parquet again.
    record = _fetch_transcript(ticker.upper(), year, quarter, int(time() // 3600))
    return dict(record) if record else None


@lru_cache(maxsize=16)
def _fetch_transcript(ticker, year, quarter, hour):
    try:
        rows = _read_rows(
            """
            SELECT report_date, transcripts
            FROM read_parquet(?)
            WHERE symbol = ? AND fiscal_year = ? AND fiscal_quarter = ?
            LIMIT 1
            """,
            [TRANSCRIPTS_URL, ticker.upper(), year, quarter], hour, timeout=20, retries=1,
        )
    except duckdb.Error as exc:
        raise RuntimeError("The transcript provider is unavailable. Please try again shortly.") from exc
    if not rows:
        return None
    row = rows[0]
    content = " ".join(
        paragraph["content"].strip()
        for paragraph in (row[1] or [])
        if paragraph.get("content")
    ).strip()
    if not content:
        return None
    return {
        "ticker": ticker.upper(), "quarter": quarter, "year": year,
        "report_date": str(row[0]) if row[0] else None, "content": content,
    }
