# Deployment checks

The public frontend is hosted on Vercel and the API on Render. The repair has been verified locally; hosted PostgreSQL connectivity must be restored before the public app can be verified end to end.

## Existing configuration

- Render: repository branch `main`, root `backend`, build `pip install -r requirements.txt`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`.
- Python: `.python-version` pins 3.11.17. A manually set `PYTHON_VERSION` takes precedence; inspect build logs to confirm the runtime actually selected.
- Vercel: repository branch `main`, root `frontend`, Vite build output `dist`. `frontend/vercel.json` declares Vite explicitly so the deployment does not inherit an incorrect dashboard framework preset.
- Backend credentials: `DATABASE_URL`, `GEMINI_API_KEY`; optional `GEMINI_MODEL`. Store these only in the backend hosting environment.
- Frontend: optional build-time `VITE_API_BASE_URL` and `VITE_FMP_API_KEY`. The existing Render URL is the default API base. All `VITE_` values are public.
- `render.yaml` requires an existing database connection and does not provision or purchase a database.

## Supabase connection

Use the existing SQLAlchemy/psycopg2 backend with Supabase's **Session pooler** connection on port 5432. Obtain the actual hostname and username from the project's Connect dialog. The session pooler supports IPv4 on the Free plan without an IPv4 add-on.

Set `sslmode=verify-full` in the backend connection URL and `DATABASE_SSL_ROOT_CERT=supabase-ca.crt` in Render. The public CA certificate was downloaded from Supabase's authenticated Database Settings page ([official certificate](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt)). A custom certificate path is resolved relative to `backend`; without one, the backend uses Certifi's standard trust bundle. Keep the connection URL in Render's environment settings. Enable row-level security on app tables and leave them inaccessible to Supabase's anonymous/authenticated Data API roles; the backend owns database access.

Supabase Free may pause projects with low database activity over seven days. It is not an always-on availability guarantee. Source: [connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres), [pausing policy](https://supabase.com/docs/guides/platform/free-project-pausing).

## Before promoting

1. Restore a reachable PostgreSQL connection; investigate existing resources and recovery before replacement. Require the provider's supported TLS configuration. Do not silently fall back to ephemeral SQLite on Render.
2. Inspect the existing schema. `create_all()` creates missing tables but does not migrate columns. Anonymous analyses require nullable `analyses.user_id`.
3. Run `python -m unittest discover -s backend`, `node --test frontend/test/api.test.js`, and the frontend production build. Automated tests isolate their storage and mock providers.
4. Deploy the reviewed commit and verify the actual revision and Python runtime in Render and Vercel.
5. Require `/health` to return 200 with a connected database. Confirm a fresh, real analysis saves, displays prices when available, appears in history, and reopens from cache through the public frontend. Check a missing transcript and a phone layout.

A frontend deployment, a liveness response at `/`, or a local test alone does not establish that the public app is working.
