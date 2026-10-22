from datetime import date
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
import transcript


class TranscriptCoverageChecks(unittest.TestCase):
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
