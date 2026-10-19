from decimal import Decimal
import unittest
from unittest.mock import patch

from context import prior_outlook, compare_outlook, revenue_highlight, dated_news, transcript_revenue


class ContextChecks(unittest.TestCase):
    def test_literal_revenue_fallback_preserves_its_source_and_rejects_wrong_scope(self):
        text = "Hello. Total revenue was $6.05 billion, down from a year ago."
        item = transcript_revenue(text)
        self.assertEqual(item["value"], "$6.05 billion")
        citation = item["citations"][0]
        self.assertEqual(text[citation["start"]:citation["end"]], citation["quote"])
        for text in ("Total revenue was lower than $8 billion last year.", "Gaming total revenue was $2 billion.", "We expect total revenue was $6 billion."):
            self.assertIsNone(transcript_revenue(text))
        text = "Q4 revenue was $6.05 billion, up 2% sequentially. Full year revenue was $27 billion."
        item = transcript_revenue(text, 4)
        self.assertEqual(item["value"], "$6.05 billion")
        self.assertIsNone(transcript_revenue(text, 3))
        earlier = "Let me turn to the outlook for the fourth quarter of fiscal 2023. We expect modest growth. We expect continued production shipments. Revenue is expected to be $6 billion, plus or minus 2%."
        outlooks = prior_outlook(earlier, 4, year=2023)
        self.assertTrue(outlooks[0]["period_explicit"])
        self.assertFalse(prior_outlook(earlier, 4, year=2024)[0]["period_explicit"])
        self.assertEqual(compare_outlook(outlooks, revenue_highlight({"financial_highlights":[item]}))["position"], "within")

    def test_worded_outlook_connects_to_the_same_quarter_reported_growth(self):
        quote = "Today, Apple is reporting revenue of $119.6 billion for the December quarter, up 2% from a year ago despite having one less week in the quarter."
        actual = revenue_highlight({"financial_highlights": [{"label": "Total Revenue", "value": "$119.6 billion", "citations": [{"quote": quote}]}]})
        earlier = "Also, on foreign exchange, we expect a negative year-over-year revenue impact of about 1 percentage point. Despite having one less week this year, we expect our December quarter, total company revenue to be similar to last year. We expect iPhone revenue to grow year-over-year on an absolute basis."
        outlooks = prior_outlook(earlier, 1, actual["period_terms"])
        result = compare_outlook(outlooks, actual)
        self.assertEqual(result["status"], "directional")
        self.assertEqual(result["actual_change"], "2% growth year over year")
        self.assertIn("similar to last year", result["outlook"]["quote"])
        self.assertNotIn("range", result)
        self.assertEqual(next(item for item in outlooks if "foreign exchange" in item["quote"])["metric_scope"], "currency_impact")
        self.assertEqual(compare_outlook(prior_outlook(earlier, 2), actual)["status"], "unscored")
        self.assertEqual(compare_outlook(prior_outlook("For next quarter, when we remove a prior-year impact, we expect revenue to be similar to last year.", 1), actual)["status"], "unscored")

    def test_disclaimer_and_past_results_are_not_forecasts(self):
        text = ("Please note our forward-looking statements include revenue, gross margin and our future business outlook. "
                "Today, Apple reported revenue of $111.2 billion, at the high end of our guidance range. "
                "Mac revenue was $8.4 billion, driven by higher-than-expected demand. "
                "For next quarter, we expect revenue growth in the low single digits.")
        outlooks = prior_outlook(text, 3)
        self.assertEqual(len(outlooks), 1)
        self.assertIn("For next quarter, we expect", outlooks[0]["quote"])

    def test_quarter_range_compares_but_annual_or_wrong_metric_is_unscored(self):
        text = "For Q2, we expect revenue between $60.4 billion and $61.4 billion."
        result = compare_outlook(prior_outlook(text, 2), {"amount": Decimal(62_000_000_000), "value": "$62 billion"})
        self.assertEqual((result["status"], result["position"]), ("compared", "above"))
        for text in ("For the full year, we expect revenue between $60 billion and $70 billion.",
                     "For Q2, Intelligent Cloud revenue is expected between $25 billion and $26 billion.",
                     "For Q2, we expect revenue growth and EPS between $1.20 and $1.30."):
            self.assertEqual(compare_outlook(prior_outlook(text, 2), {"amount": Decimal(62), "value": "$62"})["status"], "unscored")

    def test_headlines_exclude_future_dates_and_unsafe_links(self):
        xml = b'''<rss><channel><item><title>Historical headline</title><pubDate>Tue, 30 Jan 2024 12:00:00 GMT</pubDate><link>https://news.google.com/rss/articles/one</link><source>Publisher</source></item><item><title>Future headline</title><pubDate>Thu, 01 Feb 2024 12:00:00 GMT</pubDate><link>https://news.google.com/rss/articles/two</link></item><item><title>Unsafe</title><pubDate>Tue, 30 Jan 2024 12:00:00 GMT</pubDate><link>javascript:alert(1)</link></item></channel></rss>'''
        with patch("context.download", return_value=xml):
            result = dated_news("MSFT", "2024-01-30")
        self.assertEqual([item["title"] for item in result["items"]], ["Historical headline"])


if __name__ == "__main__":
    unittest.main()
