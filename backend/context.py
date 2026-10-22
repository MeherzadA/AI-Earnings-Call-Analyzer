"""Optional, cached research context. No LLM calls and no inferred article content."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from email.utils import parsedate_to_datetime
import re
import xml.etree.ElementTree as ET

import requests

from research import source_hash, source_passages, quantities
from transcript import fetch_transcript
from comparisons import additional_comparisons

USER_AGENT = "EarningsAnalyzer/1.0 (https://github.com/MeherzadA/AI-Earnings-Call-Analyzer)"
NAMES = {"AAPL": "Apple", "MSFT": "Microsoft", "NVDA": "NVIDIA", "PYPL": "PayPal"}
CONTEXT_VERSION = 6


def context_complete(context):
    return context.get("version") == CONTEXT_VERSION and all(
        context.get(section, {}).get("status") in ("available", "empty")
        for section in ("previous_call", "news")
    )


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
                result = {"label": item["label"], "value": item["value"], "amount": amounts[0], "citations": item["citations"], "period_terms": []}
                for citation in item["citations"]:
                    for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z])", citation["quote"]):
                        values = [value for value, kind, currency in quantities(sentence) if currency == "$" and kind == "number"]
                        if values != amounts or not re.search(r"\b(?:revenue|net sales)\b", sentence, re.I) or re.search(r"\b(?:expect|forecast|constant currency|adjusted)\b", sentence, re.I):
                            continue
                        result["period_terms"] += re.findall(r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December) quarter\b", sentence, re.I)
                        change = re.search(r"\b(up|down)\s+(\d+(?:\.\d+)?)%\s+(?:year.over.year|from (?:a year ago|last year)|compared (?:with|to) (?:a year ago|last year))\b", sentence, re.I)
                        if change:
                            result["year_over_year"] = str(Decimal(change[2]) * (-1 if change[1].lower() == "down" else 1))
                return result
    return None


def transcript_revenue(text, quarter=None):
    """Literal fallback for older reports: require explicit company/quarter scope, never infer a value."""
    quarter_scope = rf"Q{quarter} revenue|{('first', 'second', 'third', 'fourth')[quarter - 1]}[ -]quarter revenue|" if quarter else ""
    for passage in source_passages(text):
        for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z])", passage["text"]):
            if re.search(r"\b(?:expect|forecast|guidance|annual|full year|segment|services|gaming|data center|cloud)\b", sentence, re.I):
                continue
            match = re.search(rf"\b(?:{quarter_scope}total (?:company )?revenue(?: for (?:the|this|our) quarter)?|quarterly revenue|revenue for (?:the|this|our|the fourth|the third|the second|the first) quarter)\s+(?:was|were|of|reached|totaled|came in at)\s+(?:a record |record )?\$(\d[\d,.]*)\s*(billion|million)\b", sentence, re.I)
            if not match:
                continue
            value = re.search(r"\$\d[\d,.]*\s*(?:billion|million)", match[0], re.I)[0]
            start = passage["start"] + passage["text"].index(sentence)
            return {"label": "Quarterly revenue", "value": value, "citations": [{"passage_id": passage["id"], "quote": sentence, "start": start, "end": start + len(sentence)}]}
    return None


def prior_outlook(text, quarter, period_terms=(), year=None):
    """Extract explicit revenue expectations; leave ambiguous periods unscored."""
    results = []
    ordinal = ("first", "second", "third", "fourth")[quarter - 1]
    target = re.compile(rf"\b(?:Q{quarter}|{ordinal} quarter|next quarter)\b", re.I)
    for passage in source_passages(text):
        # Two adjacent sentences preserve simple introductory fiscal-period context.
        sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z])", passage["text"])
        for i, sentence in enumerate(sentences):
            if not re.search(r"\b(revenue|net sales)\b", sentence, re.I):
                continue
            # Mentioning 'guidance' or 'higher-than-expected' historical results is not a forecast.
            future = re.search(r"\b(?:we|I|management|the company)\s+(?:(?:currently|now|still|also)\s+)?(?:expect|anticipate|project|forecast|estimate|believe)\b|\b(?:total\s+)?(?:company\s+)?(?:revenue|net sales)\s+(?:is|are)\s+(?:expected|projected|forecast)\s+to\b", sentence, re.I)
            if not future or re.search(r"forward-looking statements|safe harbor|undue reliance", sentence, re.I):
                continue
            if len(sentence) > 700:
                continue
            context = " ".join(sentences[max(0, i - 1):i + 1])
            # A forecast header can precede several segment remarks. Use the nearest explicit
            # outlook header in this passage, including its stated fiscal year, not a distant quarter mention.
            prefix = " ".join(sentences[:i])
            headers = list(re.finditer(r"\b(?:outlook|guidance)\s+for\s+(?:the\s+|our\s+)?(Q[1-4]|(?:first|second|third|fourth|next) quarter|(?:full|fiscal) year)(?:\s+of\s+(?:fiscal\s+)?(?:year\s+)?(\d{4}))?", prefix, re.I))
            header = headers[-1] if headers and len(prefix) - headers[-1].end() <= 1500 else None
            header_year_ok = not header or not year or not header[2] or int(header[2]) == year
            header_matches = bool(header and target.search(header[1]) and header_year_ok)
            if re.search(r"\b(?:above|below) our outlook\b", sentence, re.I) and not re.search(r"\bexpect|\banticipat", sentence, re.I):
                continue
            segment = bool(re.search(r"\b(?:segment|Productivity and Business Processes|Intelligent Cloud|Personal Computing|Data Center|Services|iPhone|gaming)\b", sentence, re.I))
            currency_impact = bool(re.search(r"foreign exchange|currency (?:impact|headwind|tailwind)", sentence, re.I))
            entry = {"quote": sentence, "passage_id": passage["id"], "context": passage["text"],
                     "metric_scope": "currency_impact" if currency_impact else "segment_or_unclear" if segment else "company_revenue",
                     "period_explicit": header_year_ok and (header_matches or bool(target.search(context)) or any(term.lower() in context.lower() for term in period_terms)) and not bool(re.search(r"\b(?:full year|annual|fiscal year)\b", context, re.I))}
            # Scope a range to the revenue clause; do not use an EPS or expense range later in the sentence.
            forward_clause = sentence[future.start():]
            revenue_clause = re.split(r"\b(?:revenue|net sales)\b", forward_clause, maxsplit=1, flags=re.I)
            clause = re.split(r";|\b(?:EPS|earnings per share|operating expenses|operating income|gross margin)\b", revenue_clause[-1], flags=re.I)[0][:150]
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
    return sorted(results, key=lambda item: (item["metric_scope"] == "company_revenue", item["period_explicit"], "low" in item), reverse=True)[:3]


def compare_outlook(outlooks, actual):
    match = next((item for item in outlooks if "low" in item and item["period_explicit"] and item["metric_scope"] == "company_revenue"), None)
    if actual and not match and "year_over_year" in actual:
        for item in outlooks:
            if not item["period_explicit"] or item["metric_scope"] != "company_revenue" or re.search(r"constant currency|adjusted|excluding|when we remove", item["quote"], re.I):
                continue
            if re.search(r"\b(?:similar|flat|unchanged)\b.*\b(?:last year|a year ago|year.over.year)\b", item["quote"], re.I):
                change = Decimal(actual["year_over_year"])
                direction = "grew" if change > 0 else "fell" if change < 0 else "was unchanged"
                return {"status": "directional", "outlook": item, "expected": "Revenue broadly unchanged year over year",
                        "actual_change": f"{abs(change):g}% {'growth' if change > 0 else 'decline' if change < 0 else 'change'} year over year",
                        "headline": f"Revenue {direction} after an outlook of little change",
                        "message": f"Management expected revenue similar to the prior year. This call reports {actual['value']}, {direction} {abs(change):g}% year over year." if change else f"Management expected little change, and this call reports unchanged year-over-year revenue of {actual['value']}.",
                        "takeaway": ("Revenue increased rather than remaining flat. " if change > 0 else "Revenue declined rather than remaining flat. " if change < 0 else "The reported direction agrees with an outlook of little change. ") + "'Similar' has no stated numerical tolerance, so this does not establish an exact target was beaten or missed.",
                        "limitation": "A directional comparison of management's statements, not independent verification or an analyst-consensus beat/miss."}
    if not match or not actual:
        if not actual:
            reason = "The report does not include a total-company revenue result with which to test the earlier forecast."
        elif not outlooks:
            reason = "No explicit revenue forecast was found in the previous call, so there is no identified revenue target to test. This does not prove management gave no guidance."
        elif not any(item.get("metric_scope") == "company_revenue" for item in outlooks):
            reason = "The earlier projections cover segments or currency effects. This check has only total-company revenue, so it cannot establish whether those projections were met."
        elif not any("low" in item for item in outlooks):
            reason = "Management described a revenue outlook in words, but this report lacks a matching year-over-year result or an unambiguous period. An amount alone cannot tell whether growth expectations were met."
        else:
            reason = "The earlier forecast could not be tied to the same fiscal quarter and revenue scope. Comparing it with this result could give a misleading verdict."
        return {"status": "unscored", "headline": "This report can’t establish whether revenue met the earlier outlook", "message": reason}
    value, low, high = actual["amount"], Decimal(match["low"]), Decimal(match["high"])
    position = "above" if value > high else "below" if value < low else "within"
    takeaway = f"Reported revenue was {money(value - high)} above the top of management's earlier range." if value > high else f"Reported revenue was {money(low - value)} below the bottom of management's earlier range." if value < low else "Reported revenue landed inside management's earlier range."
    return {"status": "compared", "position": position, "range": f"{money(low)}–{money(high)}",
            "outlook": match, "expected": f"{money(low)}–{money(high)}", "headline": f"Revenue was {position} management’s earlier range", "takeaway": takeaway,
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


def fetch_context_sources(ticker, year, quarter, call_date, previous=None, cached=None):
    """Fetch independent sources while the report's AI analysis is running."""
    previous_year, previous_quarter = (year, quarter - 1) if quarter > 1 else (year - 1, 4)
    previous_error = None
    try:
        previous = previous or fetch_transcript(ticker, previous_year, previous_quarter)
    except RuntimeError:
        previous_error = "The preceding transcript could not be retrieved."
    cached = cached or {}
    news = cached.get("news", {})
    if cached.get("call_date") != call_date or news.get("status") not in ("available", "empty"):
        try:
            news = dated_news(ticker, call_date)
        except (requests.RequestException, RuntimeError, ValueError, KeyError, ET.ParseError) as error:
            news = {"status": "unavailable", "message": str(error) if isinstance(error, RuntimeError) else "Headlines could not be loaded.", "items": []}
    return {"previous": previous, "previous_error": previous_error, "news": news}


def build_context(ticker, year, quarter, research, call_date, previous=None, current_text="", sources=None):
    if not call_date:
        current = fetch_transcript(ticker, year, quarter)
        call_date = current.get("report_date") if current else None
    if not call_date:
        raise RuntimeError("The call date could not be established. Dated research was not loaded.")
    call_date = date.fromisoformat(call_date[:10]).isoformat()
    previous_year, previous_quarter = (year, quarter - 1) if quarter > 1 else (year - 1, 4)
    actual = revenue_highlight(research)
    if actual is None:
        literal = transcript_revenue(current_text, quarter)
        actual = revenue_highlight({"financial_highlights": [literal]}) if literal else None
    prior = {"year": previous_year, "quarter": previous_quarter, "outlooks": []}
    sources = sources if sources is not None else fetch_context_sources(ticker, year, quarter, call_date, previous, research.get("context"))
    previous = sources["previous"]
    if previous and previous.get("report_date") and previous["report_date"][:10] >= call_date:
        previous = None
    if previous:
        prior.update(status="available", source_hash=source_hash(previous["content"]), report_date=previous.get("report_date"),
                     outlooks=prior_outlook(previous["content"], quarter, actual.get("period_terms", []) if actual else [], year))
    else:
        prior.update(status="unavailable", message=sources["previous_error"] or "The preceding fiscal call was not available.")
    comparison = compare_outlook(prior["outlooks"], actual)
    if actual:
        comparison["reported"] = {key: value for key, value in actual.items() if key not in ("amount", "period_terms")}
    cached = research.get("context", {})
    news = sources["news"]
    return {"version": CONTEXT_VERSION, "call_date": call_date, "loaded_at": datetime.now(timezone.utc).isoformat(),
            "external_sources_loaded_at": cached.get("external_sources_loaded_at", cached.get("loaded_at")) if cached.get("call_date") == call_date else datetime.now(timezone.utc).isoformat(), "previous_call": prior,
            "comparison": comparison, "additional_comparisons": additional_comparisons(previous["content"], current_text, prior["outlooks"], quarter, year, actual.get("period_terms", []) if actual else []) if previous and prior["status"] == "available" else [], "news": news,
            "scope": "No extra AI generation. Prior-call extraction, stated-value arithmetic, and dated headline links. These sources do not establish impartiality or report accuracy."}
