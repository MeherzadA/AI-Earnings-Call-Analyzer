"""Refresh autocomplete coverage offline: python backend/update_transcript_catalog.py.

The archive scan reads the symbol column only and can take several minutes.
Never run it in a search request. Company names come from Nasdaq's public directory.
"""
import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import requests

from transcript import TRANSCRIPTS_URL


def write_catalog(symbols):
    names = {}
    for filename, symbol_column, name_column in (
        ("nasdaqlisted.txt", "Symbol", "Security Name"),
        ("otherlisted.txt", "ACT Symbol", "Security Name"),
    ):
        response = requests.get(f"https://www.nasdaqtrader.com/dynamic/SymDir/{filename}", timeout=(5, 20))
        response.raise_for_status()
        for row in csv.DictReader(io.StringIO(response.text), delimiter="|"):
            if row.get(symbol_column) and row.get(name_column):
                names[row[symbol_column]] = row[name_column].split(" - ")[0]
    companies = [{"symbol": symbol, "name": names.get(symbol, symbol)} for symbol in sorted(set(symbols)) if symbol]
    if not companies or not names:
        raise RuntimeError("Empty company catalog; keeping the existing file.")
    target = Path(__file__).with_name("transcript_companies.json")
    target.write_text(json.dumps({"updated_at": datetime.now(timezone.utc).isoformat(), "source": TRANSCRIPTS_URL, "companies": companies}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(companies)} transcript-covered companies ({sum(c['name'] != c['symbol'] for c in companies)} named).")


if __name__ == "__main__":
    with duckdb.connect(":memory:", config={"memory_limit": "128MB", "threads": "1"}) as connection:
        symbols = [row[0] for row in connection.execute("SELECT DISTINCT symbol FROM read_parquet(?) WHERE symbol IS NOT NULL", [TRANSCRIPTS_URL]).fetchall()]
    write_catalog(symbols)
