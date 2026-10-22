# Report latency and transcript coverage

The first request for a fiscal call fetches its transcript, generates and checks one Gemini brief, retrieves prices, and prepares prior-call comparisons and dated news. Prices and research-source retrieval now overlap AI generation. Comparisons are assembled after the checked findings are available, then persisted with the report. The SQLAlchemy session is never shared with worker threads.

Gemini 2.5 Flash uses a 1,024-token thinking budget instead of its dynamic default. This limits internal reasoning, not the answer length or the transcript input. Other configured models retain their own defaults. Citation and numeric checks still run. This is a latency/quality tradeoff, not proof that semantic accuracy is unchanged. See [Google's thinking-budget documentation](https://ai.google.dev/gemini-api/docs/generate-content/thinking#thinking-budgets).

Both saved-report reads and cached `/analyze` requests return stored data without contacting external providers. Missing optional sources can be retried from the research view without another AI generation. Provider failures never justify inventing a comparison or an article.

`GET /transcripts/{ticker}/periods` checks the transcript provider's fiscal periods and dates. Stock-directory suggestions do not guarantee transcript coverage. Coverage uses a bounded hourly cache; failures are not cached as empty coverage. One Parquet reader at a time limits memory use on the free instance. The search form checks coverage while the user enters a period; it does not delay submission while coverage is unknown, and saved reports remain available even if the provider's coverage changes.

## Observations on October 21, 2026

- Warm production `/health`: 0.328 seconds; history: 0.163 seconds.
- Existing VET Q3 FY2023 report 23: 0.219 seconds to reopen. Its original context completed about 5.9 seconds after the AI brief's timestamp.
- Local metadata lookup: VS had no calls (2.89 seconds); VET had 44 periods including Q3 FY2023 (2.62 seconds). The repeated VET coverage lookup was below 1 millisecond.
- The user reported approximately 40 seconds for the original VET generation. These changes were validated with mocked AI/provider tests and read-only source requests, without spending another Gemini call. A new end-to-end generation time and quality comparison have not been measured.

AI duration and total report duration are logged for future measurements. Do not promise a fixed time from a warm cache measurement. Render Free can sleep after inactivity and impose a separate startup delay; eliminating that requires an always-on hosting plan, not a fake progress bar or keep-alive traffic. See [Render's free-instance limitations](https://render.com/docs/free#spinning-down-on-idle).
