# Deployment

The hosted app uses Vercel for the React frontend, Render for the FastAPI backend, and Supabase PostgreSQL for saved reports.

| Service | Configuration |
| --- | --- |
| Vercel | Root `frontend`, Vite build, output `dist`; framework declared in `frontend/vercel.json`. |
| Render | Root `backend`; install `requirements.txt`; start `uvicorn main:app --host 0.0.0.0 --port $PORT`; health check `/health`. |
| PostgreSQL | Tables in `backend/schema.sql`, mirrored by `backend/models.py`. |

`render.yaml` describes the backend service. An existing manually configured service also needs its dashboard settings kept in sync. The deployment uses Python 3.11.17.

## Configuration

Set `DATABASE_URL` and `GEMINI_API_KEY` in the backend hosting environment. `GEMINI_MODEL` optionally overrides the default model in `backend/analysis.py`.

For the Supabase session pooler, use a connection URL with `sslmode=verify-full` and set `DATABASE_SSL_ROOT_CERT=supabase-ca.crt`. The bundled certificate is a public certificate authority, not a credential. Keep connection URLs and API keys out of the repository.

The backend owns database access. Keep row-level security enabled and app tables unavailable to Supabase's anonymous and authenticated Data API roles.

The frontend accepts `VITE_API_BASE_URL` at build time and otherwise uses the hosted Render API. All `VITE_` values are public browser configuration; backend credentials must stay on the server.

## Schema and release checks

Back up an existing database before applying `backend/migrations/001_research_reports.sql`. It adds the nullable `research_json` column without replacing original report fields. SQLAlchemy's `create_all()` creates missing tables but does not migrate existing columns.

Run the [automated checks](architecture.md#verification), then deploy the backend before a frontend that depends on new endpoints. Confirm `/health` returns HTTP 200 with a connected database and the expected schema. Check a report, its transcript and price history, saved-link reopening, an unavailable transcript, and a phone layout.

Hosting cold starts and external-provider availability affect response times. A successful frontend build alone does not establish that the API and database are working.
