"""Additional literal forecast/result pairs. Ambiguous metrics and periods stay omitted."""
import re
from decimal import Decimal
from research import source_passages


def sentences(text):
    for passage in source_passages(text):
        for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z])", passage["text"]):
            start = passage["start"] + passage["text"].index(sentence)
            yield sentence, {"passage_id": passage["id"], "quote": sentence, "start": start, "end": start + len(sentence)}


def additional_comparisons(previous_text, current_text, outlooks, quarter, year, period_terms=()):
    pairs = []
    baseline = f"Q{quarter} FY{year - 1}"
    current = list(sentences(current_text))
    for outlook in outlooks:
        if not outlook["period_explicit"] or outlook["metric_scope"] != "segment_or_unclear" or re.search(r"constant currency|adjusted|excluding|normaliz|full.year|annual", outlook["quote"], re.I):
            continue
        match = re.search(r"\bwe\s+(?:also\s+)?expect\s+([\w][\w &-]{0,60}?)\s+revenue\s+to\s+(grow|increase|decline|decrease|fall)\s+year.over.year", outlook["quote"], re.I)
        if not match:
            continue
        segment, direction = match.groups()
        for sentence, citation in current:
            if not re.match(rf"\s*{re.escape(segment)}\s+revenue\s+(?:was|came in at|reached|totaled)\b", sentence, re.I):
                continue
            if re.search(r"\b(?:expect|forecast|adjusted|constant currency|next quarter|full.year|annual)\b", sentence, re.I) or any(int(value) != year for value in re.findall(r"\b20\d{2}\b", sentence)) or any(int(value) != quarter for value in re.findall(r"\bQ([1-4])\b", sentence, re.I)):
                continue
            growth = re.search(r"\b(up|down)\s+(\d+(?:\.\d+)?)%\s+year.over.year\b", sentence, re.I)
            if not growth:
                continue
            change = Decimal(growth[2]) * (-1 if growth[1].lower() == "down" else 1)
            expected_up = direction.lower() in ("grow", "increase")
            agrees = (change > 0) if expected_up else (change < 0)
            actual_direction = "grew" if change > 0 else "declined" if change < 0 else "was flat"
            change_label = "growth" if change > 0 else "decline" if change < 0 else "change"
            pairs.append({"metric": f"{segment} revenue", "status": "directional", "outlook": outlook,
                "expected": "Year-over-year growth" if expected_up else "Year-over-year decline",
                "reported": {"value": f"{change:+g}%", "citations": [citation]}, "actual_change": f"Compared with {baseline}",
                "headline": f"{segment} revenue {actual_direction}, {'as forecast' if agrees else 'against the forecast direction'}",
                "takeaway": f"Management expected {segment} revenue to {'grow' if expected_up else 'decline'}. The Q{quarter} FY{year} call reported {abs(change):g}% {change_label} versus {baseline}.",
                "limitation": "Direction only: management did not state an exact growth target."})
            break
    ordinal = ("first", "second", "third", "fourth")[quarter - 1]
    target = re.compile(rf"\b(?:Q{quarter}|{ordinal} quarter)\b", re.I)
    for sentence, citation in sentences(previous_text):
        # Require the forecast sentence to name the quarter; inherited section scope is not used.
        if not (target.search(sentence) or any(term.lower() in sentence.lower() for term in period_terms)):
            continue
        if any(int(value) != year for value in re.findall(r"\b20\d{2}\b", sentence)) or re.search(r"\b(?:products|services|segment|adjusted|non.GAAP|full.year|annual)\b", sentence, re.I):
            continue
        match = re.search(r"\bwe expect (?:total company |company |consolidated )?gross margin to be (?:between )?(\d+(?:\.\d+)?)%\s*(?:and|to|–|-)\s*(\d+(?:\.\d+)?)%", sentence, re.I)
        if not match:
            continue
        low, high = map(Decimal, match.groups())
        if not 0 <= low <= high <= 100:
            continue
        for actual_sentence, actual_citation in current:
            actual = re.match(r"\s*(?:Total company|Company|Consolidated) gross margin (?:was|reached|came in at) (\d+(?:\.\d+)?)%", actual_sentence, re.I)
            if not actual or re.search(r"\b(?:adjusted|non.GAAP|expect|forecast|full.year|annual)\b", actual_sentence, re.I):
                continue
            if any(int(value) != year for value in re.findall(r"\b20\d{2}\b", actual_sentence)) or any(int(value) != quarter for value in re.findall(r"\bQ([1-4])\b", actual_sentence, re.I)):
                continue
            value = Decimal(actual[1])
            position = "above" if value > high else "below" if value < low else "within"
            pairs.append({"metric": "Company gross margin", "status":"compared", "position":position,
                "expected":f"{low:g}–{high:g}%", "outlook":citation, "reported":{"value":f"{value:g}%", "citations":[actual_citation]},
                "headline":f"Gross margin landed {position} the forecast range", "takeaway":f"Reported company gross margin of {value:g}% was {position} management’s {low:g}–{high:g}% range.",
                "limitation":"Company gross margin only; product, services and adjusted margins are not substituted."})
            break
        break
    return pairs[:3]
