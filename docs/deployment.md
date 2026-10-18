# Deployment checks

The public frontend is hosted on Vercel, the API on Render, and PostgreSQL on Supabase Free. Production was verified end to end on October 18, 2026.

## Verified production deployment

- Frontend: [earnings-analyzer-vercel2.vercel.app](https://earnings-analyzer-vercel2.vercel.app).
- API: [database health](https://earnings-analyzer-er72.onrender.com/health), returning HTTP 200 with `database: connected`.
- Both hosts deployed merge commit `d4653e795739bdae0cc8576c300889a89f9b9f4e` from [repair PR #4](https://github.com/MeherzadA/AI-Earnings-Call-Analyzer/pull/4). Render's build log confirmed Python 3.11.17.
- Restored all 17 existing transcripts and 8 analyses from local PostgreSQL into a separate Supabase project, preserving their fields and timestamps. The original local database remains at 17 transcripts and 8 analyses.
- A fresh AAPL fiscal Q1 2024 request through the public interface fetched a 44,035-character transcript, produced a Gemini report, fetched six Yahoo closing prices, and saved both records. Production then contained 18 transcripts and 9 analyses.
- A repeated public request returned `cached: true` in about 0.3 seconds. All four history sort modes returned HTTP 200, and both the new Apple report and a restored NVIDIA report reopened through the UI.
- Apple prices covered February 1–8, 2024: call-day close $186.86, next trading day $185.85, fifth trading day $188.32. Returns were −0.54% and +0.78%. The chart and expandable table displayed those values.
- A real missing-transcript request for ZZZZZZZZ Q1 2024 returned HTTP 404 and a readable public UI error. No partial transcript or analysis was saved.
- Loading state, keyboard insight tabs, and phone layouts at 390 and 320 pixels were checked in the public browser. The expanded price table and chart caused no document overflow.
- Automated verification: 14 Python tests and 5 Node tests passed; the frontend production build passed. These tests use mocked providers and temporary SQLite, separately from the live checks above.

## Diagnosis

The old Render revision `865aee4` failed during database startup because its configured hostname could not be resolved. The old database resource was unavailable in the only accessible Render workspace, and its direct dashboard URL reported that it did not exist. This does not establish why the resource became unavailable. After investigating that setup, the user selected Supabase Free for replacement storage.

Review also found an obsolete transcript dataset path, full-dataset downloading unsuitable for the free instance, an anonymous-analysis schema mismatch, and fragile provider/error handling. The repair reused inspected fixes from unpublished commit `4e8074b`, added safe database diagnostics and joined history queries, and improved the existing React interface. No paid plan was enabled.

## Existing configuration

- Render: repository branch `main`, root `backend`, build `pip install -r requirements.txt`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`.
- Render health-check path: `/health`. The existing service is manually configured; changing `render.yaml` alone does not update dashboard settings.
- Python: `.python-version` pins 3.11.17. A manually set `PYTHON_VERSION` takes precedence; inspect build logs to confirm the runtime actually selected.
- Vercel: repository branch `main`, root `frontend`, Vite build output `dist`. `frontend/vercel.json` declares Vite explicitly so the deployment does not inherit an incorrect dashboard framework preset.
- Backend credentials: `DATABASE_URL`, `GEMINI_API_KEY`; optional `GEMINI_MODEL`. Store these only in the backend hosting environment.
- Frontend: optional build-time `VITE_API_BASE_URL` and `VITE_FMP_API_KEY`. The existing Render URL is the default API base. All `VITE_` values are public.
- `render.yaml` requires an existing database connection and does not provision or purchase a database.

## Supabase connection

Use the existing SQLAlchemy/psycopg2 backend with Supabase's **Session pooler** connection on port 5432. Obtain the actual hostname and username from the project's Connect dialog. The session pooler supports IPv4 on the Free plan without an IPv4 add-on.

Set `sslmode=verify-full` in the backend connection URL and `DATABASE_SSL_ROOT_CERT=supabase-ca.crt` in Render. The public CA certificate was downloaded from Supabase's authenticated Database Settings page ([official certificate](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt)). A custom certificate path is resolved relative to `backend`; without one, the backend uses Certifi's standard trust bundle. Keep the connection URL in Render's environment settings. Enable row-level security on app tables and leave them inaccessible to Supabase's anonymous/authenticated Data API roles; the backend owns database access.

Supabase Free may pause projects with low database activity over seven days. It is not an always-on availability guarantee. Source: [connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres), [pausing policy](https://supabase.com/docs/guides/platform/free-project-pausing).

## Future deployment checks

1. Restore a reachable PostgreSQL connection; investigate existing resources and recovery before replacement. Require the provider's supported TLS configuration. Do not silently fall back to ephemeral SQLite on Render.
2. Inspect the existing schema. `create_all()` creates missing tables but does not migrate columns. Anonymous analyses require nullable `analyses.user_id`.
3. Run `python -m unittest discover -s backend`, `node --test frontend/test/api.test.js`, and the frontend production build. Automated tests isolate their storage and mock providers.
4. Deploy the reviewed commit and verify the actual revision and Python runtime in Render and Vercel.
5. Require `/health` to return 200 with a connected database. Confirm a fresh, real analysis saves, displays prices when available, appears in history, and reopens from cache through the public frontend. Check a missing transcript and a phone layout.

A frontend deployment, a liveness response at `/`, or a local test alone does not establish that the public app is working.
