"""Deterministic trading-day checks; no Yahoo requests."""

import unittest
from unittest.mock import patch
import pandas as pd
from prices import calculate_returns


class PriceTests(unittest.TestCase):
    def test_month_window_contains_21_post_call_sessions(self):
        dates = pd.bdate_range("2024-02-01", periods=30)
        data = pd.DataFrame({"Close": [100 + i for i in range(30)]}, index=dates)
        with patch("prices.yf.download", return_value=data):
            result = calculate_returns("AAPL", "2024-02-01")
        self.assertEqual(len(result["daily_prices"]), 22)
        self.assertEqual(result["daily_prices"][-1]["date"], dates[21].strftime("%Y-%m-%d"))
        self.assertEqual(result["daily_prices"][-1]["price"], 121)
        self.assertEqual((result["return_1day"], result["return_5day"]), (1, 5))

    def test_returns_use_valid_trading_days_and_unadjusted_closes(self):
        dates = pd.to_datetime(["2024-02-01", "2024-02-02", "2024-02-05", "2024-02-06", "2024-02-07", "2024-02-08", "2024-02-09"])
        data = pd.DataFrame({("Close", "AAPL"): [100, 110, None, 90, 105, 115, 120]}, index=dates)
        with patch("prices.yf.download", return_value=data) as download:
            result = calculate_returns("AAPL", "2024-02-01")
        self.assertEqual(result["return_1day"], 10)
        self.assertEqual(result["return_5day"], 20)
        self.assertEqual(result["return_5day_date"], "2024-02-09")
        self.assertEqual(len(result["daily_prices"]), 6)
        self.assertFalse(download.call_args.kwargs["auto_adjust"])

    def test_recent_call_keeps_available_prices_before_day_five(self):
        data = pd.DataFrame({"Close": [100, 110]}, index=pd.to_datetime(["2024-02-01", "2024-02-02"]))
        with patch("prices.yf.download", return_value=data):
            result = calculate_returns("AAPL", "2024-02-01")
        self.assertEqual(result["return_1day"], 10)
        self.assertIsNone(result["return_5day"])
        self.assertEqual(len(result["daily_prices"]), 2)


if __name__ == "__main__":
    unittest.main()
