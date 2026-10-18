"""Deterministic failure tests; no model calls and no claimed semantic accuracy."""
import copy
import unittest

from research import ResearchDraft, check_research, numbers_match, source_hash, source_passages, parse_draft
import json
from pydantic import ValidationError

SOURCE = "Sales increased 10% to $20 million. Management expects stable demand."
DRAFT = {
    "management_tone": "positive", "financial_highlights": [],
    "findings": [{"category": "performance", "headline": "Sales increased",
                  "observation": "Sales increased 10% to $20 million.",
                  "interpretation": "The company reported sales growth.",
                  "citations": [{"passage_id": "P1", "quote": "Sales increased 10% to $20 million."}]}],
}


class SourceChecks(unittest.TestCase):
    def checked(self, draft):
        return check_research(ResearchDraft.model_validate(draft), SOURCE, 2024, "test-model")

    def test_valid_quote_is_located_in_the_original_source(self):
        report = self.checked(DRAFT)
        citation = report["findings"][0]["citations"][0]
        self.assertEqual(SOURCE[citation["start"]:citation["end"]], citation["quote"])
        self.assertEqual(report["source_hash"], source_hash(SOURCE))
        self.assertEqual(report["checks"]["human_review"], "not_reviewed")

    def test_invalid_evidence_and_changed_values_fail_closed(self):
        for mutation in ("fake_quote", "unknown_passage", "changed_number", "changed_unit", "changed_currency"):
            with self.subTest(mutation=mutation):
                draft = copy.deepcopy(DRAFT)
                finding = draft["findings"][0]
                if mutation == "fake_quote":
                    finding["citations"][0]["quote"] = "Sales increased 20% to $20 million."
                elif mutation == "unknown_passage":
                    finding["citations"][0]["passage_id"] = "P999"
                else:
                    finding["observation"] = {"changed_number": "Sales increased 20%.", "changed_unit": "Sales reached $20 billion.", "changed_currency": "Sales reached €20 million."}[mutation]
                with self.assertRaisesRegex(RuntimeError, "did not pass source checks"):
                    self.checked(draft)

    def test_bad_findings_and_highlights_are_removed_without_padding(self):
        draft = copy.deepcopy(DRAFT)
        bad = copy.deepcopy(draft["findings"][0])
        bad["observation"] = "Sales increased 99%."
        draft["findings"].append(bad)
        draft["financial_highlights"] = [{"label": "Sales", "value": "$20 billion", "citations": bad["citations"]}]
        result = self.checked(draft)
        self.assertEqual(len(result["findings"]), 1)
        self.assertEqual(result["financial_highlights"], [])
        self.assertEqual(len(result["checks"]["discarded"]), 2)

    def test_individual_schema_failure_is_omitted_without_editing_valid_text(self):
        data = copy.deepcopy(DRAFT)
        bad = copy.deepcopy(data["findings"][0])
        bad["citations"][0]["quote"] = "x" * 701
        data["findings"].append(bad)
        draft, omitted = parse_draft(json.dumps(data))
        report = check_research(draft, SOURCE, 2024, "test-model", omitted)
        self.assertEqual(report["checks"]["findings_checked"], 2)
        self.assertEqual(report["checks"]["findings_retained"], 1)
        self.assertEqual(report["checks"]["discarded"][0]["reason"], "invalid_structure")
        with self.assertRaises(ValidationError):
            parse_draft('{"sentiment":"positive"}')

    def test_units_percentages_and_negatives_are_not_interchangeable(self):
        for claim, evidence in [("10%", "10 basis points"), ("-10%", "10%"), ("$20 billion", "$20 million"), ("$99B", "$20 billion"), (".5%", ".7%"), ("1e9", "10 million")]:
            self.assertFalse(numbers_match(claim, evidence, 2024))
        self.assertTrue(numbers_match("10% and $20 million", "10 percent and $20 million", 2024))
        self.assertTrue(numbers_match("$20M and .5%", "$20 million and 0.5 percent", 2024))
        self.assertFalse(numbers_match("The company will open 2024 stores.", "Sales increased 10%.", 2024))
        self.assertTrue(numbers_match("FY 2024 sales increased 10%.", "Sales increased 10%.", 2024))
        self.assertTrue(numbers_match("Full Year 2024 revenue $20 million", "Full year revenue was $20 million.", 2024))

    def test_whitespace_only_normalization_preserves_actual_quote(self):
        draft = copy.deepcopy(DRAFT)
        draft["findings"][0]["citations"][0]["quote"] = "Sales  increased 10% to $20 million."
        self.assertEqual(self.checked(draft)["findings"][0]["citations"][0]["quote"], "Sales increased 10% to $20 million.")
        draft["findings"][0]["citations"][0]["quote"] = " " * 12
        with self.assertRaises(RuntimeError):
            self.checked(draft)

    def test_passages_reconstruct_source_and_do_not_stall_on_long_words(self):
        text = SOURCE * 100 + "x" * 3000
        passages = source_passages(text)
        self.assertEqual("".join(p["text"] for p in passages), text)
        self.assertEqual(passages[-1]["end"], len(text))
        self.assertTrue(all(p["end"] > p["start"] for p in passages))

    def test_real_quote_with_invented_inference_can_pass_mechanical_checks(self):
        # Deliberate counterexample: this is a semantic error for a person to review.
        draft = copy.deepcopy(DRAFT)
        draft["findings"][0]["interpretation"] = "Therefore the company will open stores next year."
        result = self.checked(draft)
        self.assertEqual(len(result["findings"]), 1)
        self.assertIn("does not establish", result["checks"]["limitation"])
        self.assertEqual(result["checks"]["human_review"], "not_reviewed")
