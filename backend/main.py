"""
In your terminal make sure you're in the `backend` folder and run:
uvicorn main:app --reload

http://127.0.0.1:8000/docs for FastAPi auto-generated documentaiton
"""


"""
cd backend
source venv/bin/activate
"""


# 127.0.0.1 is localhost IP address
# we are listening on port 8000



import json
import logging
from contextlib import asynccontextmanager
from threading import Lock
from typing import Literal
from datetime import datetime, timezone
from sqlalchemy import func, text, tuple_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from database import engine, get_db

import models

from transcript import fetch_transcript

from analysis import analyze_transcript

from prices import get_stock_returns
from research import legacy_analysis, source_hash, source_passages
from context import build_context, CONTEXT_VERSION, context_complete, transcript_revenue

# Create missing tables on startup. Existing columns still require an explicit migration.
@asynccontextmanager
async def lifespan(app):
    try:
        models.Base.metadata.create_all(bind=engine)
    except SQLAlchemyError as exc:
        # Keep diagnostics available during a DB outage without logging connection strings.
        logging.error("Database initialization failed (%s)", type(exc).__name__)
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=10, pattern=r"^[A-Z][A-Z0-9.-]*$")
    year: int = Field(ge=1990, le=2100)
    quarter: int = Field(ge=1, le=4)
    with_research: bool = False

    @field_validator("ticker", mode="before")
    @classmethod
    def normalize_ticker(cls, value):
        return value.strip().upper() if isinstance(value, str) else value

EXAMPLE_PERIODS = {"AAPL": (2024, "1"), "NVDA": (2024, "4"), "PYPL": (2025, "4")}


@app.get("/")
def root():
    return {"message": "Earnings Analyzer API is running"}


@app.get("/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT research_json FROM analyses LIMIT 0"))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Database is unavailable.") from exc
    return {"status": "ok", "database": "connected"}


def saved_report(db, ticker, year, quarter):
    return db.query(models.Transcript, models.Analysis).join(models.Analysis).filter(
        models.Transcript.ticker == ticker,
        models.Transcript.year == year,
        models.Transcript.quarter == str(quarter),
    ).order_by(models.Analysis.id.desc()).first()


def stored_research(analysis):
    document = json.loads(analysis.research_json) if analysis.research_json else {}
    return document if "findings" in document else None


def report_response(transcript, analysis, cached=True):
    document = json.loads(analysis.research_json) if analysis.research_json else {}
    research = stored_research(analysis)
    if research and research["source_hash"] != source_hash(transcript.raw_text):
        raise HTTPException(status_code=503, detail="This saved report no longer matches its transcript. Please run a new analysis.")
    result = legacy_analysis(research) if research else {
        "sentiment": analysis.sentiment, "sentiment_score": analysis.sentiment_score,
        "summary": analysis.summary, "key_claims": json.loads(analysis.key_claims or "[]"),
        "red_flags": json.loads(analysis.red_flags or "[]"), "opportunities": json.loads(analysis.opportunities or "[]"),
    }
    prices = json.loads(analysis.daily_prices or "[]")
    call_date = document.get("call_date") or (prices[0]["date"] if prices else None)
    ensure_past_call(call_date)
    return {"report_id": analysis.id, "ticker": transcript.ticker, "year": transcript.year,
            "quarter": int(transcript.quarter), "analysis": result, "research": research,
            "call_date": call_date, "daily_prices": prices,
            "context": document.get("context") if document.get("source_hash") == source_hash(transcript.raw_text) else None,
            "return_1day": analysis.return_1day, "return_5day": analysis.return_5day, "cached": cached}


def ensure_past_call(call_date):
    # Fiscal years may be ahead of the calendar year. Only the actual call date is a future-date check.
    if call_date and call_date[:10] > datetime.now(timezone.utc).date().isoformat():
        raise HTTPException(status_code=404, detail=f"The provider dates this call {call_date}, which is in the future. No analysis was generated.")


def report_by_id(db, report_id):
    row = db.query(models.Transcript, models.Analysis).join(models.Analysis).filter(models.Analysis.id == report_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="This saved report was not found.")
    return row


@app.get("/reports/{report_id}")
def read_report(report_id: int, db: Session = Depends(get_db)):
    return report_response(*report_by_id(db, report_id))


@app.get("/reports/{report_id}/transcript")
def read_transcript(report_id: int, db: Session = Depends(get_db)):
    transcript, analysis = report_by_id(db, report_id)
    return {"report_id": analysis.id, "ticker": transcript.ticker, "year": transcript.year,
            "quarter": int(transcript.quarter), "source_hash": source_hash(transcript.raw_text),
            "passages": source_passages(transcript.raw_text)}


@app.post("/reports/{report_id}/context")
def load_context(report_id: int, db: Session = Depends(get_db)):
    transcript, analysis = report_by_id(db, report_id)
    report_response(transcript, analysis)  # Validate stored source and actual call date.
    document = json.loads(analysis.research_json) if analysis.research_json else {}
    if document.get("source_hash") == source_hash(transcript.raw_text) and context_complete(document.get("context", {})):
        return {"context": document["context"], "cached": True}
    if not generation_lock.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Another report or research request is running. Please try again shortly.")
    try:
        db.refresh(analysis)
        research = json.loads(analysis.research_json) if analysis.research_json else {}
        if research.get("source_hash") not in (None, source_hash(transcript.raw_text)):
            research = {}
        if context_complete(research.get("context", {})):
            return {"context": research["context"], "cached": True}
        previous_year, previous_quarter = (transcript.year, int(transcript.quarter) - 1) if int(transcript.quarter) > 1 else (transcript.year - 1, 4)
        previous = db.query(models.Transcript).filter_by(ticker=transcript.ticker, year=previous_year, quarter=str(previous_quarter)).order_by(models.Transcript.id.desc()).first()
        prices = json.loads(analysis.daily_prices or "[]")
        call_date = research.get("call_date") or (prices[0]["date"] if prices else None)
        context_source = {**research}
        if not context_source.get("financial_highlights"):
            revenue = transcript_revenue(transcript.raw_text, int(transcript.quarter))
            context_source["financial_highlights"] = [revenue] if revenue else []
        try:
            context = build_context(transcript.ticker, transcript.year, int(transcript.quarter), context_source, call_date,
                                    {"content": previous.raw_text} if previous else None)
        except RuntimeError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        research["context"] = context
        research["call_date"] = context["call_date"]
        research["source_hash"] = source_hash(transcript.raw_text)
        analysis.research_json = json.dumps(research)
        db.commit()
        return {"context": context, "cached": False}
    finally:
        generation_lock.release()


def report_with_context(transcript, analysis, db, cached=True):
    try:
        load_context(analysis.id, db)
    except HTTPException as error:
        # Keep the completed AI analysis; Research can retry without spending another model call.
        logging.warning("Research context incomplete for report %s (%s)", analysis.id, error.status_code)
    return report_response(transcript, analysis, cached=cached)


@app.get("/examples")
def examples(db: Session = Depends(get_db)):
    periods = [(ticker, *period) for ticker, period in EXAMPLE_PERIODS.items()]
    rows = db.query(models.Transcript, models.Analysis).join(models.Analysis).filter(
        tuple_(models.Transcript.ticker, models.Transcript.year, models.Transcript.quarter).in_(periods)
    ).order_by(models.Analysis.id.desc()).all()
    found = {}
    for transcript, analysis in rows:
        found.setdefault((transcript.ticker, transcript.year, transcript.quarter), {
            "report_id": analysis.id, "ticker": transcript.ticker, "year": transcript.year,
            "quarter": int(transcript.quarter), "has_research": bool(stored_research(analysis)),
        })
    return {"examples": [found[key] for key in periods if key in found]}


@app.get("/examples/{ticker}")
def read_example(ticker: str, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    period = EXAMPLE_PERIODS.get(ticker)
    row = saved_report(db, ticker, *period) if period else None
    if row is None:
        raise HTTPException(status_code=404, detail="This saved example is unavailable. Please try another example or a saved report.")
    return report_response(*row)


# ponytail: one free Render process; use a distributed generation limit if scaled to multiple workers.
generation_lock = Lock()


@app.post("/analyze")
def analyze(request: AnalyzeRequest, db: Session = Depends(get_db)):
    existing = saved_report(db, request.ticker, request.year, request.quarter)
    if existing and stored_research(existing[1]):
        stored = stored_research(existing[1])
        if stored["source_hash"] == source_hash(existing[0].raw_text) or not request.with_research:
            return report_with_context(*existing, db)
    if existing and not request.with_research:
        return report_response(*existing)
    # A single generation at a time protects the shared free-tier quota and instance memory.
    if not generation_lock.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Another report is being prepared. Please try again shortly.")
    try:
        if existing:
            db_transcript, db_analysis = existing
            transcript = {"content": db_transcript.raw_text}
        else:
            try:
                transcript = fetch_transcript(request.ticker, request.year, request.quarter)
            except RuntimeError as error:
                raise HTTPException(status_code=502, detail=str(error)) from error
            if not transcript:
                raise HTTPException(status_code=404, detail=f"No transcript found for {request.ticker} Q{request.quarter} {request.year}")
        ensure_past_call(transcript.get("report_date"))
        try:
            result = analyze_transcript(ticker=request.ticker, year=request.year, quarter=request.quarter,
                                        transcript_text=transcript["content"])
        except RuntimeError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        if transcript.get("report_date"):
            result["research"]["call_date"] = transcript["report_date"]
        if existing:
            # Upgrade only the new column; retain the original report and price fields.
            db_analysis.research_json = json.dumps(result["research"])
        else:
            returns = get_stock_returns(request.ticker, request.year, request.quarter,
                                        earnings_date=transcript.get("report_date"))
            db_transcript = models.Transcript(ticker=request.ticker, year=request.year,
                                             quarter=str(request.quarter), raw_text=transcript["content"])
            db.add(db_transcript)
            db.flush()
            db_analysis = models.Analysis(
                transcript_id=db_transcript.id, user_id=None, sentiment=result["sentiment"],
                sentiment_score=result["sentiment_score"], summary=result["summary"],
                key_claims=json.dumps(result["key_claims"]), red_flags=json.dumps(result["red_flags"]),
                opportunities=json.dumps(result["opportunities"]), research_json=json.dumps(result["research"]),
                return_1day=returns.get("return_1day"), return_5day=returns.get("return_5day"),
                daily_prices=json.dumps(returns.get("daily_prices", [])),
            )
            db.add(db_analysis)
        db.commit()
    finally:
        generation_lock.release()
    return report_with_context(db_transcript, db_analysis, db, cached=False)


@app.get("/history")
def get_history(
    sort: Literal["recent", "movers", "gains", "drops"] = "recent",
    limit: int = Query(default=10, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(models.Transcript, models.Analysis).join(
        models.Analysis, models.Analysis.transcript_id == models.Transcript.id
    )
    if sort != "recent":
        query = query.filter(models.Analysis.return_1day.isnot(None))
    order = {
        "recent": models.Transcript.id.desc(),
        "movers": func.abs(models.Analysis.return_1day).desc(),
        "gains": models.Analysis.return_1day.desc(),
        "drops": models.Analysis.return_1day.asc(),
    }[sort]
    total = query.count()
    results = []
    for t, analysis in query.order_by(order, models.Transcript.id.desc()).limit(limit).all():
        document = json.loads(analysis.research_json) if analysis.research_json else {}
        research = stored_research(analysis)
        prices = json.loads(analysis.daily_prices or "[]")
        display = legacy_analysis(research) if research else {
            "sentiment": analysis.sentiment, "sentiment_score": analysis.sentiment_score,
            "summary": analysis.summary,
        }
        results.append({
            "report_id": analysis.id,
            "has_research": bool(research),
            "ticker": t.ticker,
            "year": t.year,
            "quarter": t.quarter,
            "call_date": document.get("call_date") or (prices[0]["date"] if prices else None),
            **{key: display[key] for key in ("sentiment", "sentiment_score", "summary")},
            "return_1day": analysis.return_1day,
            "return_5day": analysis.return_5day,
        })
    return {"history": results, "total": total}
