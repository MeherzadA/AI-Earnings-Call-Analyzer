from datetime import date
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
import transcript


class TranscriptCoverageChecks(unittest.TestCase):
    def test_search_suggestions_have_transcripts_and_rank_exact_ticker_first(self):
        results = transcript.search_companies("MSFT")
        self.assertEqual(results[0]["symbol"], "MSFT")
        self.assertIn("Microsoft", results[0]["name"])
        self.assertIn("MSFT", [row["symbol"] for row in transcript.search_companies("microsoft")])
        self.assertNotIn("VS", [row["symbol"] for row in transcript.search_companies("VS")])
        self.assertEqual(transcript.search_companies("   "), [])
        self.assertLessEqual(len(transcript.search_companies("a")), 8)

    def test_retry_reuses_transcript_but_does_not_cache_provider_errors(self):
        transcript._fetch_transcript.cache_clear()
        self.addCleanup(transcript._fetch_transcript.cache_clear)
        with patch.object(transcript, "_query_lock"), patch.object(transcript.duckdb,"connect") as connect:
            connection=connect.return_value.__enter__.return_value
            connection.execute.return_value.fetchone.return_value=("2020-04-29", [{"content":"Original Microsoft call."}])
            first=transcript.fetch_transcript("msft",2020,3)
            first["content"]="changed copy"
            self.assertEqual(transcript.fetch_transcript("MSFT",2020,3)["content"],"Original Microsoft call.")
            self.assertEqual(connect.call_count,1)
            connection.execute.side_effect=transcript.duckdb.Error("test outage")
            for _ in range(2):
                with self.assertRaises(RuntimeError): transcript.fetch_transcript("VET",2020,3)
            self.assertEqual(connect.call_count,3)

    def test_provider_string_dates_and_missing_tickers_use_the_same_metadata_query(self):
        with tempfile.TemporaryDirectory() as folder, transcript.duckdb.connect(":memory:") as connection:
            connection.execute("CREATE TABLE calls(symbol VARCHAR, fiscal_year INTEGER, fiscal_quarter INTEGER, report_date VARCHAR)")
            connection.executemany("INSERT INTO calls VALUES (?, ?, ?, ?)",[
                ("VET",2023,3,"2023-11-01"),("VET",2099,3,"2099-11-01"),("VET",2022,0,"2022-11-01"),
            ])
            path=str(Path(folder)/"calls.parquet")
            connection.table("calls").write_parquet(path)
            self.assertEqual(connection.execute(transcript.COVERAGE_SQL,[path,"VET"]).fetchall(),[(2023,3,"2023-11-01")])
            self.assertEqual(connection.execute(transcript.COVERAGE_SQL,[path,"VS"]).fetchall(),[])

    def test_coverage_reuses_metadata_but_refreshes_hourly_and_returns_fresh_values(self):
        transcript._available_calls.cache_clear()
        self.addCleanup(transcript._available_calls.cache_clear)
        with patch.object(transcript,"time",return_value=7200) as clock, patch.object(transcript.duckdb,"connect") as connect:
            connection=connect.return_value.__enter__.return_value
            connection.execute.return_value.fetchall.return_value=[(2023,3,date(2023,11,1))]
            first=transcript.available_calls("vet")
            first[0]["year"]=1900
            self.assertEqual(transcript.available_calls("VET"),[{"year":2023,"quarter":3,"call_date":"2023-11-01"}])
            self.assertEqual(connect.call_count,1)
            clock.return_value+=3600
            transcript.available_calls("VET")
            self.assertEqual(connect.call_count,2)
            self.assertEqual(connection.execute.call_args.args[1],[transcript.TRANSCRIPTS_URL,"VET"])


if __name__ == "__main__":
    unittest.main()
