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
from typing import Literal
from sqlalchemy import func, text
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

    @field_validator("ticker", mode="before")
    @classmethod
    def normalize_ticker(cls, value):
        return value.strip().upper() if isinstance(value, str) else value

@app.get("/")
def root():
    return {"message": "Earnings Analyzer API is running"}


@app.get("/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Database is unavailable.") from exc
    return {"status": "ok", "database": "connected"}


@app.post("/analyze")
def analyze(request: AnalyzeRequest, db: Session = Depends(get_db)):
    # CHECK CACHE: Query for existing transcript with same ticker/year/quarter
    existing_transcript = db.query(models.Transcript).join(models.Analysis).filter(
        models.Transcript.ticker == request.ticker.upper(),
        models.Transcript.year == request.year,
        models.Transcript.quarter == str(request.quarter)
    ).first()
    
    if existing_transcript:
        # CACHE HIT: Fetch the existing analysis instead of calling Gemini
        existing_analysis = db.query(models.Analysis).filter(
            models.Analysis.transcript_id == existing_transcript.id
        ).first()
        
        if existing_analysis:
            # Deserialize JSON fields back to lists
            cached_result = {
                "sentiment": existing_analysis.sentiment,
                "sentiment_score": existing_analysis.sentiment_score,
                "summary": existing_analysis.summary,
                "key_claims": json.loads(existing_analysis.key_claims),
                "red_flags": json.loads(existing_analysis.red_flags),
                "opportunities": json.loads(existing_analysis.opportunities)
            }
            
            # Deserialize daily_prices if available
            daily_prices = []
            if existing_analysis.daily_prices:
                daily_prices = json.loads(existing_analysis.daily_prices)
            
            return {
                "ticker": request.ticker.upper(),
                "year": request.year,
                "quarter": request.quarter,
                "analysis": cached_result,
                "return_1day": existing_analysis.return_1day,
                "return_5day": existing_analysis.return_5day,
                "daily_prices": daily_prices,
                "cached": True
            }
    
    # CACHE MISS: Proceed with normal flow (fetch transcript, call Gemini, save to DB)
    try:
        transcript = fetch_transcript(request.ticker, request.year, request.quarter)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    
    if not transcript:
        raise HTTPException(status_code=404, detail=f"No transcript found for {request.ticker} Q{request.quarter} {request.year}")
    
    try:
        result = analyze_transcript(
            ticker=request.ticker,
            year=request.year,
            quarter=request.quarter,
            transcript_text=transcript["content"]
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    # Fetch stock returns (1-day and 5-day after earnings)
    stock_returns = get_stock_returns(
        request.ticker, request.year, request.quarter,
        earnings_date=transcript.get("report_date"),
    )

    # request.ticker, request.year, request.quarter come from the API request
    # transcript["content"] is the raw text fetched from defeatbeta
    db_transcript = models.Transcript(
        ticker=request.ticker.upper(),
        quarter=str(request.quarter),
        year=request.year,
        raw_text=transcript["content"]
    )
    
    # Stage the transcript to be saved — not written to DB yet
    db.add(db_transcript)
    
    # flush() sends the INSERT to the DB session so Postgres assigns an id
    # we need that id to link the analysis to this transcript below
    # without flush(), db_transcript.id would be None
    db.flush()
    
    # Create a new Analysis record linked to the transcript we just saved
    # result is the dictionary returned by Gemini
    # lists like key_claims need json.dumps() to convert them to a string for Text columns
    db_analysis = models.Analysis(
        transcript_id=db_transcript.id,
        user_id=None,
        sentiment=result.get("sentiment"),
        summary=result.get("summary"),
        key_claims=json.dumps(result.get("key_claims", [])),
        red_flags=json.dumps(result.get("red_flags", [])),
        opportunities=json.dumps(result.get("opportunities", [])),
        sentiment_score=result.get("sentiment_score"),
        return_1day=stock_returns.get("return_1day"),
        return_5day=stock_returns.get("return_5day"),
        daily_prices=json.dumps(stock_returns.get("daily_prices", []))
    )
    
    # Stage the analysis to be saved
    db.add(db_analysis)
    
    # commit() actually writes both the transcript and analysis to the database permanently
    db.commit()
    
    return {
        "ticker": request.ticker.upper(),
        "year": request.year,
        "quarter": request.quarter,
        "analysis": result,
        "return_1day": stock_returns.get("return_1day"),
        "return_5day": stock_returns.get("return_5day"),
        "daily_prices": stock_returns.get("daily_prices", []),
        "cached": False
    }

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
    results = [
        {
            "ticker": t.ticker,
            "year": t.year,
            "quarter": t.quarter,
            "sentiment": analysis.sentiment,
            "sentiment_score": analysis.sentiment_score,
            "summary": analysis.summary,
            "return_1day": analysis.return_1day,
            "return_5day": analysis.return_5day,
        }
        for t, analysis in query.order_by(order, models.Transcript.id.desc()).limit(limit).all()
    ]
    return {"history": results, "total": total}
