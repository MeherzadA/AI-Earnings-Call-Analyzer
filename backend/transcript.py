"""Fetch one earnings call with Parquet HTTP range reads, not a full download."""

import os
from functools import lru_cache
from time import time
from threading import Lock

import duckdb

TRANSCRIPTS_URL = (
    "https://huggingface.co/datasets/defeatbeta/yahoo-finance-data/resolve/main/"
    "data/US/stock_earning_call_transcripts.parquet"
)
# ponytail: one Parquet reader fits the free instance; raise concurrency with more RAM.
_query_lock = Lock()
COVERAGE_SQL = """SELECT fiscal_year, fiscal_quarter, report_date FROM read_parquet(?)
    WHERE symbol = ? AND fiscal_year IS NOT NULL AND fiscal_quarter BETWEEN 1 AND 4
      AND (report_date IS NULL OR TRY_CAST(report_date AS DATE) <= CURRENT_DATE)
    ORDER BY fiscal_year DESC, fiscal_quarter DESC"""


def available_calls(ticker: str) -> list[dict]:
    """Read only the small period/date columns; refresh coverage at least hourly."""
    return [dict(year=year, quarter=quarter, call_date=call_date) for year, quarter, call_date in _available_calls(ticker.upper(), int(time() // 3600))]


@lru_cache(maxsize=128)
def _available_calls(ticker, hour):
    config = {"memory_limit": "128MB", "threads": "1"}
    if os.getenv("DUCKDB_EXTENSION_DIRECTORY"):
        config["extension_directory"] = os.environ["DUCKDB_EXTENSION_DIRECTORY"]
    try:
        with _query_lock, duckdb.connect(":memory:", config=config) as connection:
            connection.execute("SET http_timeout=10")
            connection.execute("SET http_retries=0")
            rows = connection.execute(
                COVERAGE_SQL,
                [TRANSCRIPTS_URL, ticker],
            ).fetchall()
    except duckdb.Error as exc:
        raise RuntimeError("Transcript coverage could not be checked right now.") from exc
    return tuple((int(year), int(quarter), str(call_date) if call_date else None) for year, quarter, call_date in rows)


def fetch_transcript(ticker: str, year: int, quarter: int) -> dict | None:
    config = {"memory_limit": "128MB", "threads": "1"}
    if os.getenv("DUCKDB_EXTENSION_DIRECTORY"):
        config["extension_directory"] = os.environ["DUCKDB_EXTENSION_DIRECTORY"]
    try:
        with _query_lock, duckdb.connect(":memory:", config=config) as connection:
            connection.execute("SET http_timeout=20")
            connection.execute("SET http_retries=1")
            row = connection.execute(
                """
                SELECT report_date, transcripts
                FROM read_parquet(?)
                WHERE symbol = ? AND fiscal_year = ? AND fiscal_quarter = ?
                LIMIT 1
                """,
                [TRANSCRIPTS_URL, ticker.upper(), year, quarter],
            ).fetchone()
    except duckdb.Error as exc:
        raise RuntimeError("The transcript provider is unavailable. Please try again shortly.") from exc
    if not row:
        return None
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
