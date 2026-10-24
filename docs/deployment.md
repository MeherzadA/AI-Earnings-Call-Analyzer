# Deployment

The frontend and FastAPI backend run as separate Vercel projects. Saved reports live in Neon PostgreSQL.

| Service | Configuration |
| --- | --- |
| Frontend | Root `frontend`, Vite build, output `dist`; framework declared in `frontend/vercel.json`. |
| Backend | Root `backend`, Python 3.12 from `backend/.python-version`; `backend/vercel.json` sets region `pdx1` and a 300-second request limit. |
| PostgreSQL | Neon; tables in `backend/schema.sql`, mirrored by `backend/models.py`. |

The API is hosted at `https://earnings-analyzer-api.vercel.app`. `backend/build_vercel.py` bundles DuckDB's signed HTTP extension before the function starts, avoiding installation into the read-only runtime filesystem.

## Configuration

Set `DATABASE_URL` and `GEMINI_API_KEY` in the backend hosting environment. The Neon connection uses `sslmode=verify-full&channel_binding=require`. Leave `DATABASE_SSL_ROOT_CERT` unset to use Certifi's trust bundle. Keep connection URLs and API keys out of the repository and restrict database credentials to the backend.

Set `DUCKDB_EXTENSION_DIRECTORY=duckdb_extensions` and `XDG_CACHE_HOME=/tmp` for the Vercel function. `GEMINI_MODEL` optionally overrides the default model in `backend/analysis.py`.

The frontend accepts `VITE_API_BASE_URL` at build time and otherwise uses the hosted Vercel API. All `VITE_` values are public browser configuration; backend credentials must stay on the server.

The Render configuration, root Python version pin, and Supabase certificate are retained for rollback. They do not describe the active Vercel and Neon deployment.

## Schema and release checks

Back up an existing database before applying `backend/migrations/001_research_reports.sql`. It adds the nullable `research_json` column without replacing original report fields. SQLAlchemy's `create_all()` creates missing tables but does not migrate existing columns.

Run the [automated checks](architecture.md#verification), then deploy the backend before a frontend that depends on new endpoints. Confirm `/health` returns HTTP 200 with a connected database and the expected schema. Check a report, its transcript and price history, saved-link reopening, an unavailable transcript, and a phone layout.

Serverless cold starts and external-provider availability affect response times. A successful frontend build alone does not establish that the API and database are working.
