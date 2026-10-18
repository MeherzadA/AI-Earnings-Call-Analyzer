import unittest
from evaluate import summarize


class EvaluationLabels(unittest.TestCase):
    def setUp(self):
        self.dataset = {"dataset_id": "example", "items": [{"id": "one"}, {"id": "two"}], "mechanical_checks": {"findings_retained": 2}}

    def test_no_review_does_not_become_an_accuracy_claim(self):
        result = summarize(self.dataset)
        self.assertEqual(result["human_review"]["status"], "pending")
        self.assertEqual(result["human_review"]["reviewed"], 0)
        self.assertIsNone(result["human_review"]["supported_fraction_of_reviewed_items"])

    def test_explicit_labels_have_a_separate_denominator(self):
        annotation = {"dataset_id": "example", "review_kind": "human", "reviewer": "Test reviewer", "reviewed_at": "2026-10-18", "reviews": [{"id": "one", "label": "insufficiently_supported"}]}
        result = summarize(self.dataset, annotation)["human_review"]
        self.assertEqual((result["status"], result["reviewed"], result["total"]), ("partial", 1, 2))
        self.assertEqual(result["counts"]["insufficiently_supported"], 1)
        self.assertEqual(result["supported_fraction_of_reviewed_items"], 0)
        for change in ({"dataset_id": "wrong"}, {"review_kind": None}, {"reviewer": ""}, {"reviews": [{"id": "unknown", "label": "supported"}]}, {"reviews": [{"id": "one", "label": "supported"}] * 2}):
            with self.assertRaises(ValueError):
                summarize(self.dataset, {**annotation, **change})

    def test_ai_judgments_never_count_as_human_review(self):
        result = summarize(self.dataset, {"dataset_id": "example", "review_kind": "ai", "reviewer": "Codex (AI)",
            "reviewed_at": "2026-10-18", "reviews": [{"id": "one", "label": "supported"}]})
        self.assertEqual(result["ai_review"]["reviewed"], 1)
        self.assertEqual(result["human_review"]["reviewed"], 0)
        self.assertIsNone(result["human_review"]["supported_fraction_of_reviewed_items"])
