"""Fetch one earnings call with Parquet HTTP range reads, not a full download."""

import os
import re
import difflib
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


# Names people type that aren't in the listed company name (brands, products, old names).
COMPANY_ALIASES = {
    "google": "GOOG", "youtube": "GOOG", "waymo": "GOOG", "facebook": "META", "instagram": "META", "whatsapp": "META",
    "aws": "AMZN", "amazon web services": "AMZN", "azure": "MSFT", "xbox": "MSFT", "linkedin": "MSFT", "iphone": "AAPL",
    "coke": "KO", "chase": "JPM", "jp morgan": "JPM", "jpmorgan": "JPM", "disney": "DIS", "square": "XYZ", "cash app": "XYZ",
    "venmo": "PYPL", "hp": "HPQ", "hewlett packard": "HPQ", "att": "T", "exxon": "XOM", "j&j": "JNJ", "jnj": "JNJ",
    "goldman": "GS", "bofa": "BAC", "citi": "C", "citibank": "C", "tsmc": "TSM", "snapchat": "SNAP", "lilly": "LLY",
    "warner bros": "WBD", "hbo": "WBD", "ford": "F", "gm": "GM", "chevy": "GM", "pepsi": "PEP", "frito lay": "PEP",
}
# Listing boilerplate after the company name, e.g. "Coca-Cola Company (The) Common Stock".
_NAME_NOISE = re.compile(r"\s*(?:\(the\)|\(de\)|,?\s*(?:class [a-z]\s*)?(?:common stock|common shares|ordinary shares?|american depositary shares?|depositary shares?|shares of beneficial interest)\b.*)", re.I)
_FUND_WORDS = re.compile(r"\b(?:etf|fund|trust|notes? due|preferred|warrants?|units?|rights|depositary shares representing)\b", re.I)


def _normal(text):
    return " ".join(re.sub(r"[^a-z0-9& ]+", " ", text.casefold().replace("'", "").replace(".com", "")).split())


def clean_company_name(name):
    return _NAME_NOISE.sub("", name or "").strip(" ,")


@lru_cache(maxsize=1)
def company_catalog():
    companies = json.loads(Path(__file__).with_name("transcript_companies.json").read_text(encoding="utf-8"))["companies"]
    # One row per company: share classes (GOOG/GOOGL/GOOGM) share a name; keep the shortest symbol.
    by_name = {}
    for item in companies:
        name = clean_company_name(item["name"])
        key = _normal(name) if name != item["symbol"] else item["symbol"]
        current = by_name.get(key)
        symbols = (current["_symbols"] if current else set()) | {item["symbol"]}
        if current is None or (len(item["symbol"]), item["symbol"]) < (len(current["symbol"]), current["symbol"]):
            current = {"symbol": item["symbol"], "name": name, "_name": _normal(name), "_fund": bool(_FUND_WORDS.search(item["name"])), "_named": name != item["symbol"]}
        current["_symbols"] = symbols
        by_name[key] = current
    return list(by_name.values())


def _public(item):
    return {"symbol": item["symbol"], "name": item["name"]}


@lru_cache(maxsize=1)
def company_names():
    return {**{item["symbol"]: item["name"] for item in company_catalog()},
            "VOXX": "VOXX International", "VARRY": "Vår Energi"}


def company_name(ticker):
    return company_names().get(ticker, ticker)


def search_companies(query: str) -> list[dict]:
    """Autocomplete only companies present in the transcript archive, by ticker, name, brand or near-miss spelling."""
    raw = query.strip()
    query = _normal(raw)
    if not query:
        return []
    catalog = company_catalog()
    symbol = raw.upper()
    aliased = {COMPANY_ALIASES[key] for key in COMPANY_ALIASES if key == query or (len(query) >= 3 and key.startswith(query))}

    def rank(item):
        name, ticker = item["_name"], item["symbol"]
        words = name.split()
        if symbol in item["_symbols"]: score = 0
        elif ticker in aliased: score = 1
        elif name.startswith(query): score = 2
        elif ticker.startswith(symbol): score = 3
        elif any(word.startswith(query) for word in words) or f" {query}" in f" {name}": score = 4
        elif query in name or symbol in ticker: score = 5
        else: return None
        return (score + (6 if item["_fund"] else 0) + (0 if item["_named"] or score == 0 else 12), len(name), ticker)

    ranked = sorted((key, item) for item in catalog if (key := rank(item)))
    results = [_public(item) for _, item in ranked[:8]]
    if not results and len(query) >= 4:
        # Typos: compare against each company's first name word, e.g. "nvidai" -> NVIDIA.
        firsts = {}
        for item in catalog:
            if not item["_fund"] and item["_name"]:
                firsts.setdefault(item["_name"].split()[0], item)
        results = [_public(firsts[word]) for word in difflib.get_close_matches(query.split()[0], list(firsts), n=5, cutoff=0.75)]
    return results


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
