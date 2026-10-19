# Earnings Call Analyzer

A full-stack investment research tool that turns earnings call transcripts into 
structured AI-powered reports w/ sentiment, key claims, red flags, opportunities, 
and post-earnings stock price reaction.

The new report format prioritizes up to six findings with separate AI observations and interpretations, inspectable transcript excerpts, financial highlights, and saved report links. It uses one Gemini call per uncached analysis, followed by local source checks.

The app opens as a research workspace: dated saved calls on the left, the selected company and report in the center, and historical stock reaction on the right. The overview shows three source-linked financial highlights, compact call audio beside source context, and a key finding and concern when retained. Findings, Concerns, Market and Research tabs expose the remaining detail without reloading the report. Narrow screens stack the panels and collapse the saved-call browser. All saved reports use this layout; older statements remain explicitly unchecked rather than receiving invented citations or automatic AI regeneration.

Call playback prefers the original recording: play/pause, a seek bar, 15-second skips, speed control, and a live Web Audio frequency display. Original audio streams on demand from [EarningsCall's public demo endpoint](https://earningscall.biz/docs/audio), which currently covers Apple and Microsoft; individual recordings may be missing or rate-limited. We do not claim that original recordings are available for every company.

Every saved report, including older reports, also supports clearly labeled **transcript read-aloud** where the browser has a speech voice. It reads the stored transcript, after checking the report identity and source hash when available; it does not read an invented summary or impersonate executives. The browser speaks short text sections with pause/resume, section navigation, and speed control. Its activity animation is decorative, distinct from the original recording's frequency display. Missing or failed recordings use this fallback, and an original recording can be retried. No private provider key, paid plan, or extra Gemini call is involved. The app does not host recordings, synchronize quotations to recording timestamps, or assess vocal stress. Company marks are bundled locally from Simple Icons, with a ticker monogram for other companies.

The landing view opens an existing source-based report instead of always featuring the same three companies. The dated saved-call sidebar supports sorting and direct selection. Reports stay selected until the user changes them; there is no rotation control or timer. These actions read stored reports without generating AI analyses.

The call date and fiscal period are separate labels. A company's fiscal year can differ from the calendar year: [NVIDIA's fiscal Q3 2026 call took place November 19, 2025](https://investor.nvidia.com/news/press-release-details/2025/NVIDIA-Sets-Conference-Call-for-Third-Quarter-Financial-Results/default.aspx). A provider-supplied future call date is rejected before generation; a fiscal year ahead of the calendar year is not sufficient reason to reject a call.

Stock returns compare regular-session closes on the displayed dates. They do not capture after-hours or intraday movements. Related coverage explicitly shows this timing distinction and the chart's actual comparison window. Headlines are not checked against the article's price window, so a rise described in a headline is not presented as equivalent to the next day's close-to-close return.

Transcript read-aloud prefers English voices marked natural, neural, enhanced, or premium when the browser exposes them. Voice settings offer the available alternatives. This uses the browser's existing speech service; quality depends on the browser/device, and the app does not supply a paid neural-voice service.

The overview separates the business takeaway and concern, stock reaction, and audio. Detailed findings and forecast comparisons have their own tabs. A prominent **Full transcript** button opens the original source. Computer read-aloud highlights the current section (individual words when the browser emits word-boundary events), scrolls with reading, and can be paused or resumed in the transcript viewer. Original recordings currently have no verified alignment with our stored transcript, so synchronized highlighting is unavailable for those recordings.

The comparison reuses saved context and names both the forecast's target quarter and its year-ago baseline. Missing context opens through the Research view without another model call. Phone layouts stack the panels. An empty concerns view explicitly does not mean the company has no risks.

The business brief uses the call transcript. Optional Research context fetches and caches the preceding call, a conservative prior revenue-outlook comparison, dated headline links and SEC data when reachable. It makes no additional Gemini call. Ambiguous periods and segment/total mismatches are left unscored; headline metadata is not verified article content. Automated SEC access returned HTTP 403 during development, so the app shows an unavailable state and direct filing links rather than claiming a successful check. Read [research context scope and limitations](docs/research-context.md).

Prompt `evidence-brief-3` asks for critical reading of management remarks and analyst Q&A; the initial evaluation below covers earlier prompt versions, not measured reliability of this revision.

**Reliability:** exact quote and numeric checks do not establish semantic accuracy. Three development candidates retained 11 of 18 proposed findings after mechanical checks. A separate AI assessment of 18 selected statements judged 12 supported and 6 insufficiently supported; the six interpretations were removed from the curated examples. These are fallible AI judgments. **No independent human review has been performed.** Read the [evaluation method, observed failures, and limitations](docs/evaluation.md); these counts are not a general accuracy rate.

**Public demo:** [earnings-analyzer-vercel2.vercel.app](https://earnings-analyzer-vercel2.vercel.app). The evidence-report release was verified publicly on October 18, 2026 with a fresh [Microsoft Q2 2024 report](https://earnings-analyzer-vercel2.vercel.app/?report=20), stock prices, transcript viewing, and saved-link reopening. See [deployment notes](docs/deployment.md).


## What it does

Type in a ticker, year, and quarter. The app fetches the earnings call transcript,
runs it through Gemini AI, and returns a clean breakdown of what management said 
and how the market reacted. Results are cached so repeat queries are instant.

The saved-call browser lists completed reports, with sorting and pagination.


## Stack

- **Backend:** FastAPI and SQLAlchemy on Render; PostgreSQL on Supabase Free
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
- Small qualitative management-tone indicator, labeled as an AI assessment
- Post-earnings stock price chart (earnings date + 5 trading days)
- Cached analyses with sort by recency, largest movement, top gainers, biggest drops
- Database caching where analyzed transcripts are stored and served instantly on 
  repeat requests
- Optional ticker autocomplete using `VITE_FMP_API_KEY` (Financial Modeling Prep). Direct ticker entry works without it.
- Source-linked observations and separately labeled interpretations; up to four financial highlights.
- Read-only saved reports and transcript context, with shareable `?report=<id>` links.
- Three curated saved calls and [18 source-linked AI assessments with reasons](https://earnings-analyzer-vercel2.vercel.app/review.html), preserving the original failure examples.

## Configuration and checks

Use Python 3.11.17. Set `DATABASE_URL` and `GEMINI_API_KEY` in `backend/.env` locally or in the hosting service's environment. An existing, reachable PostgreSQL database is required for deployment; `render.yaml` does not provision or purchase one. For an isolated local demo, `DATABASE_URL=sqlite:///./local-demo.db` also works.

For an existing PostgreSQL schema, back up reports and apply `backend/migrations/001_research_reports.sql` before starting this version. It adds the nullable `research_json` column; `create_all()` does not migrate existing tables. Original report fields remain stored when a report is upgraded. New empty databases receive the column from the ORM schema.

`GEMINI_MODEL` optionally overrides the existing `gemini-2.5-flash` model. AI availability depends on the configured key's model access and quota. Set `VITE_API_BASE_URL` at frontend build time; without it the app uses the existing Render backend. Values prefixed with `VITE_` are public in the browser; keep backend credentials out of them.

From the repository root:

```bash
python -m unittest discover -s backend
cd frontend
npm run test
npm run build
```

The automated checks use temporary local storage and mock external providers. They never contact the production database or consume AI quota.
