from decimal import Decimal
import unittest
from unittest.mock import patch

from context import prior_outlook, compare_outlook, dated_news


class ContextChecks(unittest.TestCase):
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
