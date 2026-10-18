# Earnings Call Analyzer

A full-stack investment research tool that turns earnings call transcripts into 
structured AI-powered reports w/ sentiment, key claims, red flags, opportunities, 
and post-earnings stock price reaction.

**Public demo:** [earnings-analyzer-vercel2.vercel.app](https://earnings-analyzer-vercel2.vercel.app). Backend database restoration is pending; see [deployment notes](docs/deployment.md).


![Local UI preview](docs/images/homepage.jpg)

*Local preview with a real saved analysis; public backend restoration is pending.*

## What it does

Type in a ticker, year, and quarter. The app fetches the earnings call transcript,
runs it through Gemini AI, and returns a clean breakdown of what management said 
and how the market reacted. Results are cached so repeat queries are instant.

The homepage shows every previously analyzed companies, and can be sorted in a variety of ways


## Stack

- **Backend:** FastAPI, PostgreSQL, SQLAlchemy: deployed on Render
- **Frontend:** React, Recharts, Vite: deployed on Vercel
- **AI:** Google Gemini API for transcript analysis
- **Data:** DuckDB reads the requested call from defeatbeta's public Parquet dataset using HTTP range requests; yfinance supplies post-earnings prices.

## Running locally
```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

# Create a .env file in /backend with:
# DATABASE_URL=postgresql://...
# GEMINI_API_KEY=...

uvicorn main:app --reload
```
```bash
# Frontend
cd frontend
npm install
# Create frontend/.env with VITE_API_BASE_URL=http://127.0.0.1:8000
npm run dev
```

## Features
- AI analysis of US-listed companies with an available transcript for the selected fiscal period
- Sentiment scoring with visual bar
- Post-earnings stock price chart (earnings date + 5 trading days)
- Cached analyses with sort by recency, largest movement, top gainers, biggest drops
- Database caching where analyzed transcripts are stored and served instantly on 
  repeat requests
- Optional ticker autocomplete using `VITE_FMP_API_KEY` (Financial Modeling Prep). Direct ticker entry works without it.

## Configuration and checks

Use Python 3.11.17. Set `DATABASE_URL` and `GEMINI_API_KEY` in `backend/.env` locally or in the hosting service's environment. An existing, reachable PostgreSQL database is required for deployment; `render.yaml` does not provision or purchase one. For an isolated local demo, `DATABASE_URL=sqlite:///./local-demo.db` also works.

`GEMINI_MODEL` optionally overrides the existing `gemini-2.5-flash` model. AI availability depends on the configured key's model access and quota. Set `VITE_API_BASE_URL` at frontend build time; without it the app uses the existing Render backend. Values prefixed with `VITE_` are public in the browser; keep backend credentials out of them.

From the repository root:

```bash
python -m unittest discover -s backend
node --test frontend/test/api.test.js
cd frontend
npm run build
```

The automated checks use temporary local storage and mock external providers. They never contact the production database or consume AI quota.
