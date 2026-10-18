# AGENTS.md

## Project overview
- Purpose: Analyze earnings call transcripts for a given ticker/quarter/year and return a structured, LLM-generated assessment.
- Primary workflow: API receives `ticker`, `year`, `quarter` -> fetch transcript -> run Gemini analysis -> persist transcript + analysis in Postgres -> return JSON response.
- Main components:
- `backend\main.py`: FastAPI app and `/analyze` endpoint orchestration.
- `backend\transcript.py`: Fetches one call from the public defeatbeta Parquet dataset using DuckDB HTTP range reads.
- `backend\analysis.py`: LLM prompt + response parsing using `google-genai`.
- `backend\models.py`: SQLAlchemy ORM models (`User`, `SavedTicker`, `Transcript`, `Analysis`).
- `backend\database.py`: DB engine/session setup from `DATABASE_URL`.
- Data storage: Postgres tables defined in `backend\schema.sql` and mirrored by ORM.

## Setup commands
- Use Python 3.11.17; create virtualenv: `python -m venv venv`.
- Activate venv (Windows PowerShell): `.\venv\Scripts\Activate.ps1`
- Install deps: `pip install -r backend\requirements.txt`
- Set env vars: `DATABASE_URL=...` and `GEMINI_API_KEY=...` in `backend\.env`
- Start API (from `backend`): `uvicorn main:app --reload`

## Testing instructions
- From the repo root: `python -m unittest discover -s backend` and `node --test frontend/test/api.test.js`.
- Frontend production build: `cd frontend` then `npm run build`.
- Automated tests mock external providers and use a temporary SQLite database.

## Code style
- Python FastAPI app with SQLAlchemy ORM models.
- No formatter/linter config found.  <!-- TODO: add formatting/lint rules (black/ruff/flake8/etc) -->
- API returns JSON and expects `ticker`, `year`, `quarter` in POST `/analyze`.

## Dev environment tips
- `frontend` contains the React/Vite interface. `VITE_API_BASE_URL` configures its backend at build time.
- `backend\schema.sql` documents the Postgres schema; `models.py` mirrors it.
- `transcript.py` reads only the requested call remotely; it does not download the full dataset.
- `analysis.py` calls `google-genai` (Gemini) and expects valid JSON output.
