"""Fetch one earnings call with Parquet HTTP range reads, not a full download."""

import os

import duckdb

TRANSCRIPTS_URL = (
    "https://huggingface.co/datasets/defeatbeta/yahoo-finance-data/resolve/main/"
    "data/US/stock_earning_call_transcripts.parquet"
)


def fetch_transcript(ticker: str, year: int, quarter: int) -> dict | None:
    config = {"memory_limit": "128MB", "threads": "1"}
    if os.getenv("DUCKDB_EXTENSION_DIRECTORY"):
        config["extension_directory"] = os.environ["DUCKDB_EXTENSION_DIRECTORY"]
    try:
        with duckdb.connect(":memory:", config=config) as connection:
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