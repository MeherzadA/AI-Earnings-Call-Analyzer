"""Optional, cached research context. No LLM calls and no inferred article content."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from email.utils import parsedate_to_datetime
from functools import lru_cache
import os
import re
import xml.etree.ElementTree as ET

import requests

from research import source_hash, source_passages, quantities
from transcript import fetch_transcript

USER_AGENT = os.getenv("SEC_USER_AGENT", "EarningsAnalyzer/1.0 (https://github.com/MeherzadA/AI-Earnings-Call-Analyzer)")
NAMES = {"AAPL": "Apple", "MSFT": "Microsoft", "NVDA": "NVIDIA", "PYPL": "PayPal"}


def download(url, *, params=None, limit=8_000_000):
    with requests.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=(5, 10), stream=True) as response:
        if not response.ok:
            raise RuntimeError(f"Provider returned HTTP {response.status_code}.")
        chunks, size = [], 0
        for chunk in response.iter_content(65536):
            size += len(chunk)
            if size > limit:
                raise RuntimeError("Provider response exceeded the size limit.")
            chunks.append(chunk)
        return b"".join(chunks)


def money(value):
    return f"${value / Decimal(10**9):g} billion"


def revenue_highlight(research):
    for item in research.get("financial_highlights", []):
        label = item["label"].lower()
        if re.search(r"\b(revenue|net sales)\b", label) and not any(word in label for word in ("annual", "full year", "cloud", "services", "iphone", "data center", "segment")):
            amounts = [value for value, kind, currency in quantities(item["value"]) if currency == "$" and kind == "number"]
            if len(amounts) == 1:
                return {"label": item["label"], "value": item["value"], "amount": amounts[0], "citations": item["citations"]}
    return None


def prior_outlook(text, quarter):
    """Conservative numeric revenue ranges only; leave ambiguous periods unscored."""
    results = []
    ordinal = ("first", "second", "third", "fourth")[quarter - 1]
    target = re.compile(rf"\b(?:Q{quarter}|{ordinal} quarter|next quarter)\b", re.I)
    for passage in source_passages(text):
        # Two adjacent sentences preserve simple introductory fiscal-period context.
        sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z])", passage["text"])
        for i, sentence in enumerate(sentences):
            if not re.search(r"\b(revenue|net sales)\b", sentence, re.I) or not re.search(r"\b(expect|outlook|guidance|anticipate)", sentence, re.I):
                continue
            if len(sentence) > 700:
                continue
            context = " ".join(sentences[max(0, i - 1):i + 1])
            if re.search(r"\b(?:above|below) our outlook\b", sentence, re.I) and not re.search(r"\bexpect|\banticipat", sentence, re.I):
                continue
            segment = bool(re.search(r"\b(?:segment|Productivity and Business Processes|Intelligent Cloud|Personal Computing|Data Center|Services|iPhone|gaming)\b", context, re.I))
            entry = {"quote": sentence, "passage_id": passage["id"], "context": passage["text"],
                     "metric_scope": "segment_or_unclear" if segment else "company_revenue",
                     "period_explicit": bool(target.search(context)) and not bool(re.search(r"\b(?:full year|annual|fiscal year)\b", context, re.I))}
            # Scope a range to the revenue clause; do not use an EPS or expense range later in the sentence.
            clause = re.split(r";|\b(?:EPS|earnings per share|operating expenses|operating income|gross margin)\b", re.split(r"\b(?:revenue|net sales)\b", sentence, maxsplit=1, flags=re.I)[1], flags=re.I)[0][:150]
            match = re.search(r"\$([\d.]+)\s*(billion|million)?\s*(?:to|and|–|-)\s*\$?([\d.]+)\s*(billion|million)", clause, re.I)
            tolerance = re.search(r"\$([\d.]+)\s*(billion|million),?\s*(?:plus or minus|\+/-)\s*([\d.]+)%", clause, re.I)
            if match:
                scale = {"billion": 10**9, "million": 10**6}
                low = Decimal(match[1]) * scale[(match[2] or match[4]).lower()]
                high = Decimal(match[3]) * scale[match[4].lower()]
                if low <= high:
                    entry.update(low=str(low), high=str(high))
            elif tolerance:
                center = Decimal(tolerance[1]) * (10**9 if tolerance[2].lower() == "billion" else 10**6)
                delta = center * Decimal(tolerance[3]) / 100
                entry.update(low=str(center - delta), high=str(center + delta))
            if not any(item["quote"] == entry["quote"] for item in results):
                results.append(entry)
    return sorted(results, key=lambda item: ("low" in item, item["period_explicit"]), reverse=True)[:3]


def compare_outlook(outlooks, actual):
    match = next((item for item in outlooks if "low" in item and item["period_explicit"] and item["metric_scope"] == "company_revenue"), None)
    if not match or not actual:
        return {"status": "unscored", "message": "A comparable quarterly revenue range and reported value were not both identified. No beat/miss judgment is made."}
    value, low, high = actual["amount"], Decimal(match["low"]), Decimal(match["high"])
    position = "above" if value > high else "below" if value < low else "within"
    return {"status": "compared", "position": position, "range": f"{money(low)}–{money(high)}",
            "actual": actual["value"], "quote": match["quote"], "message": f"Reported revenue was {position} the extracted prior outlook range.",
            "limitation": "Compares the stated, possibly rounded revenue figures. This is management's outlook, not analyst consensus; passage selection and metric scope still need inspection."}


def dated_news(ticker, call_date):
    end = date.fromisoformat(call_date)
    start = end - timedelta(days=14)
    company = NAMES.get(ticker, ticker)
    query = f'"{company}" earnings after:{start} before:{end + timedelta(days=1)}'
    raw = download("https://news.google.com/rss/search", params={"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"}, limit=1_000_000)
    if b"<!ENTITY" in raw.upper() or b"<!DOCTYPE" in raw.upper():
        raise RuntimeError("Unexpected feed format.")
    items = []
    for item in ET.fromstring(raw).findall("./channel/item"):
        try:
            published = parsedate_to_datetime(item.findtext("pubDate", "")).astimezone(timezone.utc)
        except (TypeError, ValueError):
            continue
        link = item.findtext("link", "")
        if not start <= published.date() <= end or not link.startswith("https://news.google.com/"):
            continue
        items.append({"title": item.findtext("title", "")[:300], "source": item.findtext("source", "Unknown publisher")[:100],
                      "url": link, "published_at": published.isoformat()})
    # Source diversity is useful, but is not a claim that any publisher is neutral.
    items.sort(key=lambda item: item["published_at"], reverse=True)
    selected, sources = [], set()
    for item in items:
        if item["source"] not in sources:
            selected.append(item)
            sources.add(item["source"])
        if len(selected) == 5:
            break
    return {"status": "available" if selected else "empty", "start": str(start), "end": str(end), "items": selected,
            "limitation": "Headline metadata from Google News RSS, not read or verified article content. UTC publication dates only; same-day articles may be after the call. Historical feed coverage is incomplete."}


@lru_cache(maxsize=1)
def sec_tickers():
    import json
    try:
        return {row["ticker"]: int(row["cik_str"]) for row in json.loads(download("https://www.sec.gov/files/company_tickers.json")).values()}, None
    except (requests.RequestException, RuntimeError, ValueError, KeyError) as error:
        return {}, str(error) if isinstance(error, RuntimeError) else "SEC data could not be retrieved."


def filing_context(ticker, call_date, year, quarter):
    import json
    link = f"https://www.sec.gov/edgar/browse/?CIK={ticker}&owner=exclude"
    tickers, error = sec_tickers()
    base = {"browse_url": link, "cutoff": call_date, "facts": []}
    if error or ticker not in tickers:
        return {**base, "status": "unavailable", "message": error or "No SEC issuer mapping found. No filing figures were checked."}
    cik = tickers[ticker]
    data = json.loads(download(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"))
    cutoff = date.fromisoformat(call_date)
    for tag in ("RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"):
        values = data.get("facts", {}).get("us-gaap", {}).get(tag, {}).get("units", {}).get("USD", [])
        eligible = []
        for item in values:
            if item.get("form") not in ("10-Q", "10-K") or not item.get("start") or item.get("filed", "9999") > call_date:
                continue
            end, start = date.fromisoformat(item["end"]), date.fromisoformat(item["start"])
            if 60 <= (end - start).days <= 115 and 0 <= (cutoff - end).days <= 100 and item.get("fy") == year and item.get("fp") == f"Q{quarter}":
                eligible.append(item)
        if eligible:
            item = max(eligible, key=lambda row: (row["end"], row["filed"]))
            accession = item["accn"]
            return {**base, "status": "available", "facts": [{"label": "Quarterly revenue", "value": money(Decimal(item["val"])),
                "period_start": item["start"], "period_end": item["end"], "filed": item["filed"], "form": item["form"], "tag": tag,
                "url": f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace('-', '')}/{accession}-index.html"}],
                "message": "Company-filed figures available through the call's UTC calendar date. Intraday availability is not verified. This is not an audit or a claim that all report statements agree."}
    return {**base, "status": "empty", "message": "No directly comparable quarterly revenue fact was found in filings available by this date. Annual/Q4 derivations are not guessed."}


def build_context(ticker, year, quarter, research, call_date, previous=None):
    if not call_date:
        current = fetch_transcript(ticker, year, quarter)
        call_date = current.get("report_date") if current else None
    if not call_date:
        raise RuntimeError("The call date could not be established. Dated research was not loaded.")
    call_date = date.fromisoformat(call_date[:10]).isoformat()
    previous_year, previous_quarter = (year, quarter - 1) if quarter > 1 else (year - 1, 4)
    prior = {"year": previous_year, "quarter": previous_quarter, "outlooks": []}
    try:
        previous = previous or fetch_transcript(ticker, previous_year, previous_quarter)
        if previous and previous.get("report_date") and previous["report_date"][:10] >= call_date:
            previous = None
        if previous:
            prior.update(status="available", source_hash=source_hash(previous["content"]), report_date=previous.get("report_date"),
                         outlooks=prior_outlook(previous["content"], quarter))
        else:
            prior.update(status="unavailable", message="The preceding fiscal call was not available.")
    except RuntimeError:
        prior.update(status="unavailable", message="The preceding transcript could not be retrieved.")
    actual = revenue_highlight(research)
    comparison = compare_outlook(prior["outlooks"], actual)
    if actual:
        comparison["reported"] = {key: value for key, value in actual.items() if key != "amount"}
    sections = {}
    for name, provider in (("news", lambda: dated_news(ticker, call_date)), ("filings", lambda: filing_context(ticker, call_date, year, quarter))):
        try:
            sections[name] = provider()
        except (requests.RequestException, RuntimeError, ValueError, KeyError, ET.ParseError) as error:
            sections[name] = {"status": "unavailable", "message": str(error) if isinstance(error, RuntimeError) else "This source could not be loaded.", "items": [], "facts": []}
    return {"version": 1, "call_date": call_date, "loaded_at": datetime.now(timezone.utc).isoformat(), "previous_call": prior,
            "comparison": comparison, **sections,
            "scope": "No extra AI generation. Prior-call extraction, stated-value arithmetic, SEC data when reachable, and dated headline links. These sources do not establish impartiality or report accuracy."}
