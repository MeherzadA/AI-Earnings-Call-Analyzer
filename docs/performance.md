# Report latency and transcript coverage

## Progressive delivery

New calls use `POST /analyze/stream`. The call date and original transcript arrive first; the user can read that transcript while generation continues. Each complete finding passes the existing structure, quotation and numeric checks before it is sent. Prices arrive independently. The final event contains the persisted report, including its full research context. `/analyze` remains compatible with JSON clients. Interrupted streams do not cancel the background save. One admitted stream job and the existing generation limit prevent queued requests from multiplying memory use.

The Gemini model, full transcript input, thinking budget and final source checks are unchanged. Streaming reduces the wait before usable content appears; it does not establish faster model completion. Streaming model requests do not restart after partial output. The final report replaces the provisional findings; a failed generation clears those provisional findings and keeps the original transcript accessible.

The transcript reader now retains one locked DuckDB database instead of creating one for every coverage/current/prior-call query. DuckDB 1.4.3's HTTP, external-file and Parquet metadata caches can therefore survive between reads. The connection expires hourly because the source URL is mutable, and closes on DuckDB errors. Its memory/thread limits remain 128MB/one thread. Cold processes still need remote reads. No speedup figure is claimed from this change yet.

Production logs now distinguish transcript readiness, the model's first source-checked finding, model completion with output/thought token counts, and final report completion. First-finding duration is measured from model start; add transcript readiness to assess the server-side wait before that finding. These ordinary request observations, not mocked tests, should determine subsequent changes. Reducing reasoning, changing model or cutting transcript content would need a separate quality decision.

Methodology sources:

- [Google: streaming structured output and partial JSON](https://ai.google.dev/gemini-api/docs/generate-content/structured-output#streaming).
- [OpenAI: latency optimization, processed streaming, output tokens and parallel work](https://developers.openai.com/api/docs/guides/latency-optimization).
- [Anthropic: measuring latency and progressive responses](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency).
- DuckDB 1.4.3: [supported HTTP/external cache settings](https://github.com/duckdb/duckdb/blob/v1.4.3/src/include/duckdb/main/settings.hpp), [database-owned external-file cache](https://github.com/duckdb/duckdb/blob/v1.4.3/src/storage/external_file_cache.cpp), and [Parquet metadata cache](https://github.com/duckdb/duckdb/blob/v1.4.3/extension/parquet/parquet_extension.cpp).

The user's MSFT Q2 FY2022 request on October 21, 2026 logged `transcript_seconds=4.800`, model duration `11.451` seconds, and `total_seconds=16.317` before this release. It is an observed baseline for that request, not a promise for other calls. This release was not benchmarked by generating additional reports.

The first request for a fiscal call fetches its transcript, generates and checks one Gemini brief, retrieves prices, and prepares prior-call comparisons and dated news. Prices and research-source retrieval now overlap AI generation. Comparisons are assembled after the checked findings are available, then persisted with the report. The SQLAlchemy session is never shared with worker threads.

Gemini 2.5 Flash uses a 1,024-token thinking budget instead of its dynamic default. This limits internal reasoning, not the answer length or the transcript input. Other configured models retain their own defaults. Citation and numeric checks still run. This is a latency/quality tradeoff, not proof that semantic accuracy is unchanged. See [Google's thinking-budget documentation](https://ai.google.dev/gemini-api/docs/generate-content/thinking#thinking-budgets).

Both saved-report reads and cached `/analyze` requests return stored data without contacting external providers. Missing optional sources can be retried from the research view without another AI generation. Provider failures never justify inventing a comparison or an article.

`GET /transcripts/search?q=...` searches a checked-in catalog of 6,571 tickers extracted from the transcript archive, rather than an unrelated stock directory. Company names come from Nasdaq's public symbol directories, with ticker-only fallback where unavailable. Refresh with `python backend/update_transcript_catalog.py` when updating coverage; its metadata-only scan can take several minutes and never runs in a search request. This is a coverage snapshot: newly added symbols require a catalog refresh, but manual ticker entry still works.

`GET /transcripts/{ticker}/periods` checks live fiscal periods and dates with a bounded hourly cache. The form waits for coverage before enabling analysis, exposes available fiscal years, and disables quarters without transcripts. A coverage-service error still permits a direct attempt; it is never treated as empty coverage. Existing reports open immediately. One Parquet reader at a time limits memory use. The last 16 fetched transcripts are retained for an hour so an AI failure doesn't force another archive read on retry.

Gemini retries only HTTP 500/502/503/504 once, with a one-second backoff and a 30-second per-attempt timeout. Quota, authentication, configuration and other client errors are not retried. Safe logs record the model, HTTP status and elapsed time, never provider response bodies or prompts. A failed analysis returns without waiting for independent news/prices; the generation lock remains held until that bounded work finishes, preventing another generation from exhausting the free instance's memory. Successful reports still await and persist their research context.

## Observations on October 21, 2026

- Warm production `/health`: 0.328 seconds; history: 0.163 seconds.
- Existing VET Q3 FY2023 report 23: 0.219 seconds to reopen. Its original context completed about 5.9 seconds after the AI brief's timestamp.
- Local metadata lookup: VS had no calls (2.89 seconds); VET had 44 periods including Q3 FY2023 (2.62 seconds). The repeated VET coverage lookup was below 1 millisecond.
- The user reported approximately 40 seconds for the original VET generation. These changes were validated with mocked AI/provider tests and read-only source requests, without spending another Gemini call. A new end-to-end generation time and quality comparison have not been measured.

AI duration and total report duration are logged for future measurements. Do not promise a fixed time from a warm cache measurement. Render Free can sleep after inactivity and impose a separate startup delay; eliminating that requires an always-on hosting plan, not a fake progress bar or keep-alive traffic. See [Render's free-instance limitations](https://render.com/docs/free#spinning-down-on-idle).

The reported MSFT Q3 FY2020 failure reached Gemini after a successful 4.919-second transcript read in production logs. The prior handler discarded the provider's status, so the exact original Gemini error cannot be reconstructed. The new diagnostics and retry handling follow [Google's troubleshooting guidance](https://ai.google.dev/gemini-api/docs/troubleshooting). Automated checks use mocked AI calls.

After deployment, one live MSFT Q3 FY2020 request succeeded in 19.461 seconds (report 24, uncached). All six findings and four highlights passed source checks; prior-call research, news and 22 daily price points were present. Repeating the same request returned the cached report in 0.153 seconds without another generation. Search took 0.143 seconds for Microsoft and 0.163 seconds for VS (which was absent from the covered matches). The first live MSFT period lookup took 5.876 seconds. These are individual observations, not latency guarantees; new report generation remains noticeably slower than reopening an existing report.
