"""Run with python -m unittest discover -s backend. No provider calls or production DB."""

import os
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
TEMP = tempfile.TemporaryDirectory(prefix="earnings-api-tests-")
os.environ["DATABASE_URL"] = "sqlite:///" + (Path(TEMP.name) / "test.db").as_posix()
os.environ["GEMINI_API_KEY"] = "test-key-not-a-real-credential"

from fastapi.testclient import TestClient
import main
import analysis
from google.genai import errors
from database import Base, engine
import database
from sqlalchemy import event
from sqlalchemy.exc import OperationalError
from research import check_research, legacy_analysis, ResearchDraft
from test_research import SOURCE, DRAFT


RESEARCH = check_research(ResearchDraft.model_validate(DRAFT), SOURCE, 2024, "test-model")
REPORT = {**legacy_analysis(RESEARCH), "research": RESEARCH}
LEGACY = legacy_analysis(RESEARCH)
CONTEXT = {"version": main.CONTEXT_VERSION, "call_date": "2024-02-01",
           "previous_call": {"status": "available"}, "news": {"status": "empty"}}


class AnalysisFlowTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        self.context = patch.object(main, "build_context", return_value=CONTEXT).start()
        self.addCleanup(patch.stopall)
        self.client = TestClient(main.app)

    def tearDown(self):
        self.client.close()

    def test_anonymous_analysis_is_saved_and_reused(self):
        with patch.object(main, "fetch_transcript", return_value={"content": SOURCE, "report_date": "2024-02-01"}) as transcript, patch.object(main, "analyze_transcript", return_value=REPORT) as ai, patch.object(main, "get_stock_returns", return_value={"return_1day": None, "return_5day": None, "daily_prices": []}) as prices:
            response = self.client.post("/analyze", json={"ticker": " aapl ", "year": 2024, "quarter": 1})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["ticker"], "AAPL")
            self.assertFalse(response.json()["cached"])
            prices.assert_called_once_with("AAPL", 2024, 1, earnings_date="2024-02-01")
            repeated = self.client.post("/analyze", json={"ticker": "AAPL", "year": 2024, "quarter": 1})
            self.assertTrue(repeated.json()["cached"])
            self.assertEqual(repeated.json()["analysis"], LEGACY)
            self.assertEqual(repeated.json()["research"], response.json()["research"])
            self.assertEqual(response.json()["context"], CONTEXT)
            self.context.assert_called_once()
            self.assertEqual(transcript.call_count, 1)
            self.assertEqual(ai.call_count, 1)
            history = self.client.get("/history").json()
            self.assertEqual(history["total"], 1)
            self.assertEqual(history["history"][0]["ticker"], "AAPL")
            self.assertEqual(history["history"][0]["call_date"], "2024-02-01")

    def test_longer_prices_preserve_the_brief_and_reuse_the_cached_window(self):
        initial = {"return_1day": 1, "return_5day": 5, "daily_prices": [{"date":"2024-02-01", "price":100 + i} for i in range(6)]}
        with patch.object(main, "fetch_transcript", return_value={"content":SOURCE, "report_date":"2024-02-01"}), patch.object(main, "analyze_transcript", return_value=REPORT), patch.object(main, "get_stock_returns", return_value=initial):
            original = self.client.post("/analyze", json={"ticker":"AAPL", "year":2024, "quarter":1}).json()
        path = f"/reports/{original['report_id']}/prices"
        extended = {**initial, "daily_prices":[{"date":"2024-02-01", "price":100 + i} for i in range(22)]}
        with patch.object(main, "get_stock_returns", return_value={}) as prices, patch.object(main, "analyze_transcript") as ai:
            self.assertEqual(self.client.post(path).status_code, 503)
            self.assertEqual(self.client.get(f"/reports/{original['report_id']}").json()["daily_prices"], initial["daily_prices"])
            prices.return_value = extended
            response = self.client.post(path).json()
            self.assertEqual(len(response["daily_prices"]), 22)
            self.assertEqual(response["analysis"], original["analysis"])
            self.assertEqual(self.client.post(path).json()["daily_prices"], response["daily_prices"])
            self.assertEqual(prices.call_count, 2)
            ai.assert_not_called()

    def test_future_call_date_is_rejected_before_generation_not_by_fiscal_year(self):
        main.ensure_past_call("2025-11-19")  # NVIDIA fiscal 2026 was reported in calendar 2025.
        with patch.object(main, "fetch_transcript", return_value={"content": SOURCE, "report_date": "2099-11-19"}), patch.object(main, "analyze_transcript") as ai:
            response = self.client.post("/analyze", json={"ticker": "NVDA", "year": 2099, "quarter": 3})
            self.assertEqual(response.status_code, 404)
            self.assertIn("future", response.json()["detail"])
            ai.assert_not_called()
            self.assertEqual(self.client.get("/history").json()["total"], 0)

    def test_invalid_period_and_ticker_do_not_call_providers(self):
        with patch.object(main, "fetch_transcript") as transcript:
            for ticker, quarter in [("AAPL", 0), ("AAPL", 5), ("AAPL' OR 1=1", 1), ("", 1)]:
                with self.subTest(ticker=ticker, quarter=quarter):
                    response = self.client.post("/analyze", json={"ticker": ticker, "year": 2024, "quarter": quarter})
                    self.assertEqual(response.status_code, 422)
            transcript.assert_not_called()

    def test_context_is_cached_without_another_model_call(self):
        with patch.object(main, "fetch_transcript", return_value={"content": SOURCE}), patch.object(main, "analyze_transcript", return_value=REPORT), patch.object(main, "get_stock_returns", return_value={}):
            report = self.client.post("/analyze", json={"ticker": "AAPL", "year": 2024, "quarter": 1}).json()
        with patch.object(main, "build_context", return_value=CONTEXT) as context, patch.object(main, "analyze_transcript") as ai:
            first = self.client.post(f"/reports/{report['report_id']}/context").json()
            second = self.client.post(f"/reports/{report['report_id']}/context").json()
            self.assertTrue(first["cached"])
            self.assertTrue(second["cached"])
            context.assert_not_called()
            ai.assert_not_called()
            reopened = self.client.get(f"/reports/{report['report_id']}").json()
            self.assertEqual(reopened["research"]["context"], first["context"])
            self.assertEqual(reopened["analysis"], report["analysis"])

    def test_failed_research_retries_without_repeating_ai(self):
        failed = {**CONTEXT, "news": {"status": "unavailable"}}
        self.context.side_effect = [RuntimeError("Date lookup temporarily failed"), failed, CONTEXT]
        with patch.object(main, "fetch_transcript", return_value={"content": SOURCE}), patch.object(main, "analyze_transcript", return_value=REPORT) as ai, patch.object(main, "get_stock_returns", return_value={}):
            request = {"ticker": "AAPL", "year": 2024, "quarter": 1}
            first = self.client.post("/analyze", json=request)
            self.assertEqual(first.status_code, 200, first.text)
            self.assertIsNone(first.json()["context"])
            second = self.client.post("/analyze", json=request).json()
            self.assertEqual(second["context"], failed)
            retried = self.client.post(f"/reports/{second['report_id']}/context").json()
            self.assertEqual(retried["context"], CONTEXT)
            self.assertFalse(retried["cached"])
            self.assertTrue(self.client.post(f"/reports/{second['report_id']}/context").json()["cached"])
            ai.assert_called_once()
            self.assertEqual(self.context.call_count, 3)

    def test_legacy_reports_are_retired_without_deleting_or_generating(self):
        with database.SessionLocal() as db:
            transcript = main.models.Transcript(ticker="AAPL", year=2024, quarter="1", raw_text=SOURCE)
            db.add(transcript); db.flush()
            db.add(main.models.Analysis(transcript_id=transcript.id, summary="Keep original", key_claims='["Uncited statement"]', research_json=json.dumps({"context": CONTEXT})))
            db.commit()
        with patch.object(main, "analyze_transcript") as ai, patch.object(main, "fetch_transcript") as provider:
            self.assertEqual(self.client.get("/history").json(), {"history": [], "total": 0})
            self.assertEqual(self.client.get("/examples").json()["examples"], [])
            self.assertEqual(self.client.get("/reports/1").status_code, 410)
            self.assertEqual(self.client.get("/examples/AAPL").status_code, 410)
            self.assertEqual(self.client.post("/reports/1/context").status_code, 410)
            self.assertEqual(self.client.get("/reports/1/transcript").status_code, 200)
            ai.assert_not_called(); provider.assert_not_called()
        with database.SessionLocal() as db:
            self.assertEqual(db.get(main.models.Analysis, 1).summary, "Keep original")

    def test_explicit_upgrade_preserves_original_fields_and_uses_one_call(self):
        with database.SessionLocal() as db:
            transcript = main.models.Transcript(ticker="AAPL", year=2024, quarter="1", raw_text=SOURCE)
            db.add(transcript)
            db.flush()
            db.add(main.models.Analysis(transcript_id=transcript.id, summary="Original summary", key_claims="[]", red_flags="[]", opportunities="[]", return_1day=2.0))
            db.commit()
        with patch.object(main, "analyze_transcript", return_value=REPORT) as ai, patch.object(main, "fetch_transcript") as transcript, patch.object(main, "get_stock_returns") as prices:
            response = self.client.post("/analyze", json={"ticker": "AAPL", "year": 2024, "quarter": 1, "with_research": True})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertFalse(response.json()["cached"])
            self.assertEqual(response.json()["return_1day"], 2.0)
            self.assertTrue(self.client.post("/analyze", json={"ticker": "AAPL", "year": 2024, "quarter": 1}).json()["cached"])
            ai.assert_called_once()
            transcript.assert_not_called()
            prices.assert_not_called()
            history = self.client.get("/history").json()["history"][0]
            self.assertEqual(history["summary"], response.json()["analysis"]["summary"])
            self.assertEqual(history["sentiment"], response.json()["analysis"]["sentiment"])
        with database.SessionLocal() as db:
            row = db.get(main.models.Analysis, 1)
            self.assertEqual(row.summary, "Original summary")
            self.assertEqual(row.key_claims, "[]")
            self.assertIsNotNone(row.research_json)
            db.get(main.models.Transcript, row.transcript_id).raw_text = "Changed source"
            db.commit()
        with patch.object(main, "analyze_transcript") as ai:
            self.assertEqual(self.client.get("/reports/1").status_code, 503)
            ai.assert_not_called()

    def test_source_rejection_does_not_save_and_does_not_retry(self):
        from copy import deepcopy
        draft = deepcopy(DRAFT)
        draft["findings"][0]["citations"][0]["quote"] = "A quotation that does not occur in this transcript."
        with patch.object(main, "fetch_transcript", return_value={"content": SOURCE}), patch.object(analysis.genai, "Client") as client:
            generate = client.return_value.__enter__.return_value.models.generate_content
            generate.return_value.text = json.dumps(draft)
            response = self.client.post("/analyze", json={"ticker": "AAPL", "year": 2024, "quarter": 1})
            self.assertEqual(response.status_code, 503)
            self.assertIn("source checks", response.json()["detail"])
            generate.assert_called_once()
            self.assertEqual(self.client.get("/history").json()["total"], 0)

    def test_busy_generator_does_not_consume_another_call(self):
        main.generation_lock.acquire()
        try:
            with patch.object(main, "analyze_transcript") as ai:
                self.assertEqual(self.client.post("/analyze", json={"ticker": "AAPL", "year": 2024, "quarter": 1}).status_code, 429)
                ai.assert_not_called()
        finally:
            main.generation_lock.release()

    def test_an_older_unanalyzed_transcript_does_not_hide_a_saved_report(self):
        with database.SessionLocal() as db:
            orphan = main.models.Transcript(ticker="AAPL", year=2024, quarter="1", raw_text="Earlier transcript")
            saved = main.models.Transcript(ticker="AAPL", year=2024, quarter="1", raw_text=SOURCE)
            db.add_all([orphan, saved])
            db.flush()
            db.add(main.models.Analysis(
                transcript_id=saved.id, sentiment=REPORT["sentiment"],
                sentiment_score=REPORT["sentiment_score"], summary=REPORT["summary"],
                key_claims=json.dumps(REPORT["key_claims"]), red_flags="[]", opportunities="[]", research_json=json.dumps(RESEARCH),
            ))
            db.commit()
        with patch.object(main, "fetch_transcript", side_effect=AssertionError("A saved report must not call providers")):
            response = self.client.get("/reports/1")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["cached"])
        self.assertEqual(response.json()["analysis"], LEGACY)

    def test_missing_transcript_does_not_call_ai(self):
        with patch.object(main, "fetch_transcript", return_value=None), patch.object(main, "analyze_transcript") as ai:
            response = self.client.post("/analyze", json={"ticker": "EXAMPLE", "year": 2024, "quarter": 1})
            self.assertEqual(response.status_code, 404)
            ai.assert_not_called()

    def test_provider_failure_is_reported_without_saving_a_partial_report(self):
        with patch.object(main, "fetch_transcript", side_effect=RuntimeError("The transcript provider is unavailable.")):
            response = self.client.post("/analyze", json={"ticker": "AAPL", "year": 2024, "quarter": 1})
            self.assertEqual(response.status_code, 502)
            self.assertEqual(self.client.get("/history").json()["total"], 0)

    def test_ai_quota_failure_is_readable_and_does_not_save_a_report(self):
        with patch.object(main, "fetch_transcript", return_value={"content": "Test transcript"}), patch.object(analysis.genai, "Client") as client:
            client.return_value.__enter__.return_value.models.generate_content.side_effect = errors.ClientError(429, {"error": {"message": "Test quota failure"}})
            response = self.client.post("/analyze", json={"ticker": "AAPL", "year": 2024, "quarter": 1})
            self.assertEqual(response.status_code, 503)
            self.assertIn("quota", response.json()["detail"])
            self.assertEqual(self.client.get("/history").json()["total"], 0)

    def test_incomplete_ai_output_is_not_saved(self):
        with patch.object(main, "fetch_transcript", return_value={"content": "Test transcript"}), patch.object(analysis.genai, "Client") as client:
            client.return_value.__enter__.return_value.models.generate_content.return_value.text = '{"sentiment":"positive"}'
            response = self.client.post("/analyze", json={"ticker": "AAPL", "year": 2024, "quarter": 1})
            self.assertEqual(response.status_code, 503)
            self.assertIn("incomplete", response.json()["detail"])
            self.assertEqual(self.client.get("/history").json()["total"], 0)

    def test_database_outage_keeps_diagnostics_available_without_connection_details(self):
        outage = OperationalError("hidden connection details", {}, Exception("private database failure"))
        with patch.object(main.models.Base.metadata, "create_all", side_effect=outage):
            with TestClient(main.app) as client:
                self.assertEqual(client.get("/").status_code, 200)
                with patch.object(main.engine, "connect", side_effect=outage):
                    response = client.get("/health")
                    self.assertEqual(response.status_code, 503)
                    self.assertEqual(response.json(), {"detail": "Database is unavailable."})
                with patch.object(database, "SessionLocal") as session:
                    session.return_value.query.side_effect = outage
                    response = client.get("/history")
                    self.assertEqual(response.status_code, 503)
                    self.assertNotIn("private", response.text)
                    self.assertNotIn("hidden", response.text)
                    session.return_value.rollback.assert_called_once()

    def test_history_sorts_and_limits_in_two_queries(self):
        with database.SessionLocal() as db:
            for ticker, change in [("LOW", -8), ("MID", 2), ("HIGH", 5), ("NONE", None)]:
                transcript = main.models.Transcript(ticker=ticker, year=2024, quarter="1", raw_text="Test")
                db.add(transcript)
                db.flush()
                db.add(main.models.Analysis(transcript_id=transcript.id, sentiment="neutral", return_1day=change, research_json=json.dumps(RESEARCH)))
            db.commit()
        queries = []
        def record_query(_connection, _cursor, statement, _parameters, _context, _many):
            queries.append(statement)
        event.listen(engine, "before_cursor_execute", record_query)
        try:
            response = self.client.get("/history?sort=movers&limit=2").json()
        finally:
            event.remove(engine, "before_cursor_execute", record_query)
        self.assertEqual(response["total"], 3)
        self.assertEqual([row["ticker"] for row in response["history"]], ["LOW", "HIGH"])
        self.assertEqual(len(queries), 2)
        self.assertEqual(self.client.get("/history?sort=drops&limit=1").json()["history"][0]["ticker"], "LOW")
        self.assertEqual(self.client.get("/history?sort=gains&limit=1").json()["history"][0]["ticker"], "HIGH")
        self.assertEqual(self.client.get("/history?limit=0").status_code, 422)
        self.assertEqual(self.client.get("/history?sort=invalid").status_code, 422)


def tearDownModule():
    engine.dispose()
    TEMP.cleanup()


if __name__ == "__main__":
    unittest.main()
