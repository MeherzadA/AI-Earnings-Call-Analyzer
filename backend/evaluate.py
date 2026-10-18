"""Prepare source-linked review; keep AI and human assessments separate. No AI API calls."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

from research import source_hash, source_passages

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend/public/evaluation"
PERIODS = [("AAPL", 2024, 1), ("NVDA", 2024, 4), ("PYPL", 2025, 4)]
LABELS = ("supported", "contradicted", "insufficiently_supported")


def prepare(directory):
    backup = json.loads((directory / "production-before-research.json").read_text(encoding="utf-8"))
    reports, items = [], []
    totals = Counter()
    for ticker, year, quarter in PERIODS:
        candidate = json.loads((directory / f"{ticker}-{year}-Q{quarter}.json").read_text(encoding="utf-8"))
        research = candidate["research"]
        baseline = next(row for row in backup["analyses"] if row["id"] == candidate["report_id"])
        transcript = next(row for row in backup["transcripts"] if row["id"] == baseline["transcript_id"])
        if source_hash(transcript["raw_text"]) != research["source_hash"]:
            raise ValueError("Candidate source does not match the backup.")
        passages = {passage["id"]: passage for passage in source_passages(transcript["raw_text"])}
        key = f"{ticker}-{year}-Q{quarter}"
        reports.append({"id": key, "ticker": ticker, "year": year, "quarter": quarter,
                        "report_id": candidate["report_id"], "source_hash": research["source_hash"],
                        "model": research["model"], "prompt_version": research["prompt_version"],
                        "check_version": research["checks"]["version"], "generated_at": research["generated_at"],
                        "baseline": {name: baseline[name] for name in ("summary", "key_claims", "red_flags", "opportunities")},
                        "checks": research["checks"]})
        for field in ("findings_checked", "findings_retained", "highlights_checked", "highlights_retained"):
            totals[field] += research["checks"][field]
        for kind in ("observation", "interpretation"):
            selected = [finding for finding in research["findings"] if finding[kind].strip()][:3]
            if len(selected) != 3:
                raise ValueError(f"{key} does not contain three reviewable {kind}s; do not fabricate cases.")
            for finding in selected:
                items.append({"id": f"{key}-{finding['id']}-{kind}", "report": key, "kind": kind,
                              "headline": finding["headline"], "claim": finding[kind], "label": "unreviewed",
                              "citations": [{**citation, "context": passages[citation["passage_id"]]["text"]} for citation in finding["citations"]]})
    dataset_id = hashlib.sha256(json.dumps({"items": items, "reports": reports}, sort_keys=True).encode()).hexdigest()
    return {"dataset_id": dataset_id, "prepared_at": datetime.now(timezone.utc).isoformat(),
            "selection": "First three retained observations and first three non-empty interpretations, in model priority order, for each of three preselected calls.",
            "reports": reports, "items": items, "mechanical_checks": dict(totals)}


def summarize(dataset, annotation=None):
    expected = {item["id"] for item in dataset["items"]}
    counts = Counter({label: 0 for label in LABELS})
    reviewer = reviewed_at = None
    kind = None
    if annotation is not None:
        if annotation.get("dataset_id") != dataset["dataset_id"]:
            raise ValueError("Review belongs to a different dataset.")
        reviewer = annotation.get("reviewer", "").strip()
        reviewed_at = annotation.get("reviewed_at")
        kind = annotation.get("review_kind")
        if kind not in ("human", "ai"):
            raise ValueError("Explicit review_kind must be human or ai.")
        if not reviewer or not reviewed_at:
            raise ValueError("A reviewer and review timestamp are required.")
        seen = set()
        for item in annotation.get("reviews", []):
            if item["id"] not in expected or item["id"] in seen or item["label"] not in LABELS:
                raise ValueError("Unknown, duplicate, or invalid review item.")
            seen.add(item["id"])
            counts[item["label"]] += 1
    reviewed = sum(counts.values())
    assessed = {"status": "complete" if reviewed == len(expected) else "partial" if reviewed else "pending",
                             "reviewed": reviewed, "total": len(expected), "counts": dict(counts),
                             "supported_fraction_of_reviewed_items": counts["supported"] / reviewed if reviewed else None,
                             "reviewer": reviewer, "reviewed_at": reviewed_at}
    pending = {"status": "pending", "reviewed": 0, "total": len(expected), "counts": dict.fromkeys(LABELS, 0),
               "supported_fraction_of_reviewed_items": None, "reviewer": None, "reviewed_at": None}
    return {"dataset_id": dataset["dataset_id"], "mechanical_checks": dataset["mechanical_checks"],
            "human_review": assessed if kind == "human" else pending.copy(),
            "ai_review": assessed if kind == "ai" else pending.copy(),
            "limitations": ["Mechanical retention is not factual accuracy.",
                            "Human results describe only the selected, explicitly reviewed items; the sample is small and not random.",
                            "Baseline reports are preserved for comparison but have not been scored.",
                            "AI assessments are fallible judgments, not independent human verification or a universal accuracy rate.",
                            "An exact quote can accompany an unsupported interpretation; source matching cannot establish semantic support."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--prepare", action="store_true")
    group.add_argument("--review-file", type=Path)
    parser.add_argument("--reports-dir", type=Path, default=ROOT / ".runtime/evidence-preview")
    args = parser.parse_args()
    PUBLIC.mkdir(parents=True, exist_ok=True)
    path = PUBLIC / "review.json"
    if args.prepare:
        dataset = prepare(args.reports_dir)
        if path.exists() and (PUBLIC / "results.json").exists():
            old = json.loads((PUBLIC / "results.json").read_text(encoding="utf-8"))
            if old["human_review"]["reviewed"] or old.get("ai_review", {}).get("reviewed"):
                raise ValueError("Existing reviews must be preserved; prepare a separately versioned dataset.")
        path.write_text(json.dumps(dataset, indent=2, ensure_ascii=False), encoding="utf-8")
        annotation = None
    else:
        dataset = json.loads(path.read_text(encoding="utf-8"))
        annotation = json.loads(args.review_file.read_text(encoding="utf-8"))
    result = summarize(dataset, annotation)
    if annotation is not None:
        previous_path = PUBLIC / ("human-review.json" if annotation["review_kind"] == "ai" else "ai-review.json")
        if previous_path.exists():
            previous = json.loads(previous_path.read_text(encoding="utf-8"))
            previous_result = summarize(dataset, previous)
            other = "human_review" if previous["review_kind"] == "human" else "ai_review"
            result[other] = previous_result[other]
    (PUBLIC / "results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    if annotation is not None:
        (PUBLIC / (annotation["review_kind"] + "-review.json")).write_text(json.dumps(annotation, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"items": len(dataset["items"]), "human_review": result["human_review"], "ai_review": result["ai_review"], "mechanical_checks": result["mechanical_checks"]}))


if __name__ == "__main__":
    main()
