"""Source checks are mechanical checks, not a verdict on an AI interpretation."""
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

PROMPT_VERSION = "evidence-brief-3"
CHECK_VERSION = "source-checks-1"
LIMITATION = "Matching source excerpts and numbers does not establish that an AI interpretation is supported or that management's statements are true."


class Citation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    passage_id: str = Field(pattern=r"^P[1-9]\d*$")
    quote: str = Field(min_length=12, max_length=700)


class Finding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: Literal["performance", "guidance", "risks", "opportunities"]
    headline: str = Field(min_length=1, max_length=90)
    observation: str = Field(min_length=1, max_length=320)
    interpretation: str = Field(max_length=320)
    citations: list[Citation] = Field(min_length=1, max_length=2)


class FinancialHighlight(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(min_length=1, max_length=45)
    value: str = Field(min_length=1, max_length=70)
    citations: list[Citation] = Field(min_length=1, max_length=2)


class ResearchDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    management_tone: Literal["positive", "neutral", "negative"]
    findings: list[Finding] = Field(min_length=1, max_length=6)
    financial_highlights: list[FinancialHighlight] = Field(max_length=4)


def parse_draft(raw):
    """Reject a malformed envelope, but omit invalid individual items without another call."""
    try:
        return ResearchDraft.model_validate_json(raw), []
    except ValidationError as error:
        locations = [item["loc"] for item in error.errors()]
        if not locations or not all(len(loc) >= 2 and loc[0] in ("findings", "financial_highlights") and isinstance(loc[1], int) for loc in locations):
            raise
        rejected = {(loc[0], loc[1]) for loc in locations}
        data = json.loads(raw)
        for section in ("findings", "financial_highlights"):
            data[section] = [item for index, item in enumerate(data[section]) if (section, index) not in rejected]
        if not data["findings"]:
            raise RuntimeError("The AI report did not pass source checks. No report was saved. Please try again later.") from error
        omitted = [{"section": section, "index": index + 1, "reason": "invalid_structure"} for section, index in sorted(rejected)]
        return ResearchDraft.model_validate(data), omitted


def source_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def source_passages(text):
    """Stable, contiguous source slices, including for older flattened transcripts."""
    passages = []
    start = 0
    while start < len(text):
        end = min(start + 1400, len(text))
        if end < len(text):
            sentence = text.rfind(". ", start + 600, end)
            word = text.rfind(" ", start + 1, end)
            end = sentence + 1 if sentence != -1 else word if word != -1 else end
        passages.append({"id": f"P{len(passages) + 1}", "text": text[start:end], "start": start, "end": end})
        start = end
    return passages


QUANTITY = re.compile(
    r"(?<![\w.])(?P<currency>[$€£])?\s*(?P<number>[+−-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+))"
    r"\s*(?P<unit>trillion|billion|million|thousand|percentage points|percent|basis points|bps|%|[kmbt])?(?!\w)",
    re.IGNORECASE,
)
NUMERIC_START = re.compile(r"(?<![\w.])(?:[$€£]\s*)?[+−-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)")


def quantities(text):
    for match in QUANTITY.finditer(text):
        number = Decimal(match["number"].replace(",", "").replace("−", "-"))
        unit = (match["unit"] or "").lower()
        magnitude = {"thousand": 1000, "k": 1000, "million": 10**6, "m": 10**6, "billion": 10**9, "b": 10**9, "trillion": 10**12, "t": 10**12}.get(unit, 1)
        kind = "percent" if unit in ("%", "percent") else "percentage_points" if unit == "percentage points" else "basis_points" if unit in ("bps", "basis points") else "number"
        yield number * magnitude, kind, match["currency"] or ""


def numbers_match(statement, evidence, year):
    available = list(quantities(evidence))
    statement = re.sub(rf"\b(?:FY|fiscal(?: year)?|full year|Q[1-4])\s+{year}\b", "", statement, flags=re.IGNORECASE)
    parsed = list(QUANTITY.finditer(statement))
    if any(not any(match.start() <= token.start() and match.end() >= token.end() for match in parsed) for token in NUMERIC_START.finditer(statement)):
        return False
    for value, kind, currency in quantities(statement):
        if not any(value == n and kind == k and (not currency or currency == c) for n, k, c in available):
            return False
    return True


def check_citations(citations, passages):
    checked = []
    for citation in citations:
        if len(citation.quote.strip()) < 12:
            raise ValueError("quote_not_found")
        passage = passages.get(citation.passage_id)
        if passage is None:
            raise ValueError("unknown_passage")
        # Whitespace may vary; case, punctuation, and words must remain exact.
        pattern = r"\s+".join(re.escape(word) for word in citation.quote.split())
        match = re.search(pattern, passage["text"])
        if match is None:
            raise ValueError("quote_not_found")
        checked.append({"passage_id": passage["id"], "quote": match.group(),
                        "start": passage["start"] + match.start(), "end": passage["start"] + match.end()})
    return checked


def check_research(draft, transcript, year, model, omitted=()):
    passages = {p["id"]: p for p in source_passages(transcript)}
    findings, highlights, discarded = [], [], list(omitted)
    for field, items, accepted in (("findings", draft.findings, findings), ("financial_highlights", draft.financial_highlights, highlights)):
        for index, item in enumerate(items, 1):
            for skipped in sorted(entry["index"] for entry in omitted if entry["section"] == field):
                if skipped <= index:
                    index += 1
            try:
                citations = check_citations(item.citations, passages)
                evidence = " ".join(c["quote"] for c in citations)
                statement = " ".join((item.headline, item.observation, item.interpretation)) if field == "findings" else item.label + " " + item.value
                if not numbers_match(statement, evidence, year):
                    raise ValueError("number_or_unit_not_found")
                accepted.append({**item.model_dump(), "id": ("F" if field == "findings" else "M") + str(index), "citations": citations})
            except ValueError as error:
                discarded.append({"section": field, "index": index, "reason": str(error)})
    if not findings:
        raise RuntimeError("The AI report did not pass source checks. No report was saved. Please try again later.")
    return {
        "schema_version": 2, "management_tone": draft.management_tone,
        "findings": findings, "financial_highlights": highlights,
        "source_hash": source_hash(transcript), "model": model, "prompt_version": PROMPT_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "checks": {"version": CHECK_VERSION, "findings_checked": len(draft.findings) + sum(item["section"] == "findings" for item in omitted), "findings_retained": len(findings),
                   "highlights_checked": len(draft.financial_highlights) + sum(item["section"] == "financial_highlights" for item in omitted), "highlights_retained": len(highlights),
                   "discarded": discarded, "human_review": "not_reviewed", "limitation": LIMITATION},
    }


def legacy_analysis(research):
    """Keep existing API fields without generating a second, unchecked summary."""
    findings = research["findings"]
    tone = research["management_tone"]
    return {"sentiment": tone, "sentiment_score": {"positive": 0.5, "neutral": 0.0, "negative": -0.5}[tone],
            "summary": " ".join(f["observation"] for f in findings[:3]),
            "key_claims": [f["observation"] for f in findings if f["category"] in ("performance", "guidance")],
            "red_flags": [f["observation"] for f in findings if f["category"] == "risks"],
            "opportunities": [f["observation"] for f in findings if f["category"] == "opportunities"]}
