# Earnings Call Analyzer

Earnings calls are long, and the useful parts can be easy to miss. This app pulls together the main results, concerns, and management's outlook, with links back to the transcript so you can check the details yourself.

Choose a company, fiscal year, and quarter, or open a report someone has already run.

**[Try the live app](https://earnings-analyzer-vercel2.vercel.app)**

![The live homepage with saved earnings reports and NVIDIA's share price after its call](docs/images/readme-home.jpg)

## What it does

- Uses Gemini to pull out key findings and financial highlights, with supporting transcript excerpts.
- Shows stock price changes over the next trading day, five trading days, or a month.
- Compares earlier revenue guidance with reported results when the periods and figures match, and shows related news links.
- Lets you read the full transcript or listen with browser read-aloud. Original recordings are available for some calls.
- Saves reports in a shared library with links you can reopen without running the AI again.

<details>
<summary>See an example report</summary>

![NVIDIA's Q4 2024 report with financial highlights, findings, transcript audio and share price history](docs/images/readme-report.jpg)

</details>

## Built with

React, Vite, and Recharts on the frontend. Python, FastAPI, SQLAlchemy, and PostgreSQL on the backend. Gemini handles the analysis, DuckDB reads transcripts from defeatbeta's public dataset, and yfinance supplies historical prices.

The live app runs on Vercel, Render, and Supabase.

## Run locally

You'll need Python 3.11.17, Node.js, and a Gemini API key. These commands use PowerShell.

Create `backend/.env`:

```dotenv
DATABASE_URL=sqlite:///./local-demo.db
GEMINI_API_KEY=your_gemini_api_key
```

SQLite works for local use. If you're using an existing PostgreSQL database, apply [this migration](backend/migrations/001_research_reports.sql) before starting.

From the repository root, start the backend:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
cd backend
uvicorn main:app --reload
```

Create `frontend/.env`:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

In a second terminal, from the repository root:

```powershell
cd frontend
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). Transcript coverage varies by company and fiscal period.

To run the checks, use `python -m unittest discover -s backend` from the root, then `npm run test` and `npm run build` from `frontend`.

## A note on accuracy

The app checks quoted text and numbers against the transcript, but Gemini can still misread what they mean. Reports haven't had independent human review. The price chart shows what happened after a call, without proving what caused the move. See the [evaluation notes](docs/evaluation.md) for the checks and known limits.
