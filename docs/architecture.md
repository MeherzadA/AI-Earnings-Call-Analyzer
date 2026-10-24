# Architecture

The React frontend sends a ticker and fiscal period to a FastAPI service. PostgreSQL stores transcripts, generated reports, source metadata, and price history so saved reports can be reopened without another model request.

## Report flow

1. Search uses a bundled company catalog; the API checks which fiscal calls the transcript archive contains.
2. The backend reuses a saved report when its source matches. For a new call, DuckDB retrieves the requested transcript from defeatbeta's public Parquet dataset using HTTP range reads.
3. Gemini receives the full transcript divided into numbered passages and returns structured findings and financial highlights. Historical prices, previous-call context, and dated headlines load alongside analysis.
4. Source checks validate findings before they are displayed. The stream delivers the transcript first, then checked findings and prices, followed by the completed, saved report.
5. The frontend links each finding to its supporting passage. Saved report URLs use `?report=<id>`; switching report views keeps the loaded report in memory.

## Code map

| Location | Responsibility |
| --- | --- |
| `frontend/src/App.jsx` | Company search, fiscal-period selection, saved reports, and report loading. |
| `frontend/src/ResearchReport.jsx` | Findings, source excerpts, transcript reading, and report views. |
| `frontend/src/MarketPanel.jsx` | Historical prices and post-call returns. |
| `backend/main.py` | API routes, generation coordination, streaming, and persistence. |
| `backend/transcript.py` | Transcript coverage, company search, and remote Parquet reads. |
| `backend/analysis.py`, `backend/research.py` | Gemini prompt, response parsing, and source checks. |
| `backend/context.py`, `backend/comparisons.py` | Earlier guidance, matching reported results, and dated news. |
| `backend/prices.py` | Historical closing prices and trading-day returns. |
| `backend/models.py`, `backend/database.py` | Database models, connections, and request-scoped sessions. |

## Source checks

The backend validates the response structure, matches quoted text to the cited passage, and compares digit-based quantities with their cited excerpts, including units, signs, and currencies. Invalid items are omitted; a response with no retained findings fails instead of saving an empty brief. Reports record the source hash, model, prompt and check versions, and citation offsets.

These are mechanical checks. A matching quotation can still accompany an unsupported interpretation, and important facts can be omitted. Management tone is an AI assessment. Reports have not received independent human verification, and there is no established production accuracy score.

## Supporting context

Guidance comparisons require matching periods, metrics, and reporting bases. Ambiguous comparisons stay unscored. Historical prices show subsequent movement, not proof that the call caused it.

Google News RSS supplies dated headline links around the call. Article contents are not read or sent to Gemini. Missing context and provider failures are shown explicitly; retrying unavailable context does not regenerate the report.
