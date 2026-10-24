from decimal import Decimal
import unittest
from unittest.mock import patch
import context

from context import prior_outlook, compare_outlook, revenue_highlight, dated_news, transcript_revenue
from comparisons import additional_comparisons


class ContextChecks(unittest.TestCase):
    def test_prefetched_missing_call_does_not_repeat_provider_requests(self):
        sources={"previous":None,"previous_error":None,"news":{"status":"empty","items":[]}}
        with patch("context.fetch_transcript",side_effect=AssertionError("Already looked up")), patch("context.dated_news",side_effect=AssertionError("Already looked up")):
            result=context.build_context("VET",2023,3,{},"2023-11-02",sources=sources)
        self.assertEqual(result["previous_call"]["status"],"unavailable")
        self.assertEqual(result["news"]["status"],"empty")

    def test_additional_comparisons_require_matching_metric_period_and_quotes(self):
        earlier = "For Q1 FY2024, we expect iPhone revenue to grow year-over-year. For Q1 FY2024, we expect company gross margin to be between 45% and 46%."
        actual = "iPhone revenue was $69.7 billion, up 6% year-over-year. Company gross margin was 45.9%, up 70 basis points sequentially."
        outlooks = prior_outlook(earlier, 1, year=2024)
        pairs = additional_comparisons(earlier, actual, outlooks, 1, 2024)
        self.assertEqual([item["metric"] for item in pairs], ["iPhone revenue", "Company gross margin"])
        self.assertEqual(pairs[0]["reported"]["value"], "+6%")
        self.assertEqual(pairs[1]["position"], "within")
        for item in pairs:
            citation = item["reported"]["citations"][0]
            self.assertEqual(actual[citation["start"]:citation["end"]], citation["quote"])
        self.assertEqual(additional_comparisons(earlier, actual, prior_outlook(earlier, 2, year=2024), 2, 2024), [])
        wrong = actual.replace("iPhone", "iPad").replace("Company gross margin", "Services gross margin")
        self.assertEqual(additional_comparisons(earlier, wrong, outlooks, 1, 2024), [])
        adjusted = actual.replace("up 6%", "up 6% in constant currency").replace("Company gross margin", "Adjusted gross margin")
        self.assertEqual(additional_comparisons(earlier, adjusted, outlooks, 1, 2024), [])

    def test_research_refresh_removes_sec_and_only_retries_failed_news(self):
        cached = {"version": 4, "call_date": "2024-02-01", "filings": {"status":"unavailable"}, "news": {"status":"available", "items":[]}}
        with patch("context.download", side_effect=AssertionError("No SEC requests")), patch("context.dated_news", return_value={"status":"empty", "items":[]}) as news:
            current = context.build_context("AAPL", 2024, 1, {"context":cached}, "2024-02-01", {"content":"Hello."})
            self.assertNotIn("filings", current)
            self.assertTrue(context.context_complete(current))
            news.assert_not_called()
            current["news"] = {"status":"unavailable"}
            retried = context.build_context("AAPL", 2024, 1, {"context":current}, "2024-02-01", {"content":"Hello."})
            self.assertTrue(context.context_complete(retried))
            news.assert_called_once()

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

    def test_annual_revenue_is_not_relabelled_as_the_fourth_quarter(self):
        text = ("Let me recap the annual financial comparisons. Loriann will then recap the quarter. "
                "On a consolidated basis, net sales of approximately $469 million were down 12.2% year-over-year. "
                "Moving on to the quarter. Fourth quarter comparisons. Net sales of just $108 million were down 20.8%.")
        quote = "On a consolidated basis, net sales of approximately $469 million were down 12.2% year-over-year."
        start = text.index(quote)
        annual = {"label":"Consolidated net sales", "value":"approximately $469 million",
                  "citations":[{"quote":quote, "start":start, "end":start + len(quote)}]}
        self.assertIsNone(revenue_highlight({"financial_highlights":[annual]}, text, 4, 2024))
        actual = transcript_revenue(text, 4, 2024)
        self.assertEqual(actual["value"], "$108 million")
        citation = actual["citations"][0]
        self.assertEqual(text[citation["start"]:citation["end"]], citation["quote"])
        self.assertIsNone(transcript_revenue(text, 3, 2024))
        self.assertIsNone(transcript_revenue("Q4 FY2023 net sales were $108 million.", 4, 2024))
        self.assertIsNone(transcript_revenue("Total revenue was $469 million.", 4, 2024))
        gaming = {"label":"Gaming revenue", "value":"$4 billion", "citations":[{"quote":"This quarter, gaming revenue was $4 billion.", "start":0, "end":42}]}
        self.assertIsNone(revenue_highlight({"financial_highlights":[gaming]}))
        intro = "Welcome to the second quarter fiscal 2026 call. " + "Background discussion. " * 100
        quote = "Total revenue was $46.7 billion, exceeding our outlook."
        actual = {"label":"Total revenue", "value":"$46.7 billion", "citations":[{"quote":quote, "start":len(intro), "end":len(intro)+len(quote)}]}
        self.assertEqual(revenue_highlight({"financial_highlights":[actual]}, intro+quote, 2, 2026)["value"], "$46.7 billion")
        note = "We expect annual AI infrastructure investments to grow. "
        self.assertNotEqual(context.reporting_scope(note+quote, len(note), len(note+quote), 2, 2026), "annual")


        sources = {"previous":None, "previous_error":None, "news":{"status":"empty", "items":[]}}
        result = context.build_context("VOXX", 2024, 4, {"financial_highlights":[annual]}, "2024-05-15", current_text=text, sources=sources)
        self.assertEqual(result["comparison"]["reported"]["value"], "$108 million")

    def test_news_uses_catalog_names_and_can_explicitly_refresh_an_empty_feed(self):
        cached = {"call_date":"2025-05-06", "news":{"status":"empty", "items":[]}}
        with patch("context.download", return_value=b"<rss><channel/></rss>") as download:
            news = dated_news("LITE", "2025-05-06")
        self.assertIn('"Lumentum Holdings"', download.call_args.kwargs["params"]["q"])
        self.assertIn("checked_at", news)
        with patch("context.dated_news", return_value=news) as fetch:
            context.build_context("LITE", 2025, 3, {"context":cached}, "2025-05-06", {"content":"Hello."})
            fetch.assert_not_called()
            context.build_context("LITE", 2025, 3, {"context":cached}, "2025-05-06", {"content":"Hello."}, refresh_news=True)
            fetch.assert_called_once()

    def test_headlines_exclude_future_dates_and_unsafe_links(self):
        xml = b'''<rss><channel><item><title>Historical headline</title><pubDate>Tue, 30 Jan 2024 12:00:00 GMT</pubDate><link>https://news.google.com/rss/articles/one</link><source>Publisher</source></item><item><title>Future headline</title><pubDate>Thu, 01 Feb 2024 12:00:00 GMT</pubDate><link>https://news.google.com/rss/articles/two</link></item><item><title>Unsafe</title><pubDate>Tue, 30 Jan 2024 12:00:00 GMT</pubDate><link>javascript:alert(1)</link></item></channel></rss>'''
        with patch("context.download", return_value=xml):
            result = dated_news("MSFT", "2024-01-30")
        self.assertEqual([item["title"] for item in result["items"]], ["Historical headline"])


if __name__ == "__main__":
    unittest.main()
