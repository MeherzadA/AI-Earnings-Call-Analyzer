# Report latency and transcript coverage

## Completion-time change: free-tier Flash-Lite

The new default is `gemini-3.5-flash-lite` with explicit `minimal` thinking.
`GEMINI_MODEL=gemini-2.5-flash` retains its 1,024-token budget; other overrides
retain their provider defaults. Prompt `evidence-brief-5` requests compact JSON,
avoids interpretations that repeat observations, and clarifies that each quote
must fit within its cited passage. Full-transcript input, material findings and
risks, financial highlights, citation/numeric checks, research, persistence and
the light UI remain in place. No output-token cap or paid fallback was added.

### Actual measurements on October 21, 2026

| Request | Transcript, server | Gemini completion | Total, server | Completed saved response, client |
| --- | ---: | ---: | ---: | ---: |
| MSFT Q2 FY2022 baseline, report 26 | 4.800 s | 11.451 s | 16.317 s | not recorded |
| MSFT Q3 FY2022, compact-output experiment, report 27 | 6.316 s | 11.671 s | 18.147 s | 18.309 s |
| MSFT Q4 FY2022, Flash-Lite, report 28 | 5.996 s | 6.050 s | 12.230 s | 12.438 s |

Render deployed `57d7229` successfully. Its one fresh `POST /analyze/stream`
created [report 28](https://earnings-analyzer-vercel2.vercel.app/?report=28),
`cached: false`, with `evidence-brief-5` and the new model. Full server completion
was about 25% shorter than the original 16.317-second baseline, and Gemini time
about 47% shorter, despite slower transcript retrieval. This is one observed
new-report result on a different fiscal call, not a controlled latency guarantee.
The client timer ended on the completed, persisted `report` event, not a finding.

The 53,868-character source had 42 passages. Four of six candidate findings
survived (including two risks); two were rejected by numeric checks. All four
highlights, prior-call research, dated news and 22 price points were present.
Source hashes and every retained quote's exact offsets were verified against
the full transcript, and the persisted report reopened unchanged. Gemini
reported 1,283 output tokens and no thought-token count. No transcript prefetch
or client POST retry was used. Together with the free model-only trial below,
this used two additional free generations after the unsuccessful output-only
experiment; there was no bulk test or paid comparison.

The output-only experiment deployed as `050d594` did **not** demonstrate a
speedup. Its 2.5 Flash run generated 1,488 output and 727 thought tokens.
Baseline token counts were not recorded, so no output-token reduction can be
claimed. Report 27 was uncached; its 56,159-character transcript had 43 passages.
Four of six findings (including one risk) and all four highlights survived the
checks; two quotations were rejected. Prior-call research, news and 22 daily
prices were present, and the saved report reopened unchanged.

One real Flash-Lite request then used that **same complete transcript and the
same prompt**. It finished in **3.964 seconds**, about 66% less model time than
the 11.671-second production run. It generated 1,168 output tokens; thought-token
usage was absent (`None`, not a measured zero). Four of five findings, including
a licensing-revenue risk, and all four highlights survived; one quotation
crossing a passage boundary was rejected. This request ran locally against
Gemini: it excludes archive retrieval, context and persistence. Different
network paths/provider load and one sample limit the comparison; it does not
establish a general end-to-end speedup. No report was reopened as a fresh test.

**Quality tradeoff:** a lighter model with minimal thinking may miss nuance or
produce unsupported interpretations. These excerpts received AI inspection,
not independent human evaluation. Equal semantic accuracy is unproven; human
review remains `not_reviewed`. Exact retained offsets and source hashes were
checked against the full source, and invalid citations still fail closed.

AI Studio confirmed the earnings-analyzer project is **Free tier**, with
Flash-Lite limits of 15 RPM, 250K input TPM and 500 RPD. Billing stayed disabled;
hosting was not upgraded. [Google's pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)
lists free text input/output for this tier. Limits and availability may change.
The [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
and [thinking controls](https://ai.google.dev/gemini-api/docs/thinking#controlling-thinking)
describe its latency/quality settings. [Google's latency guidance](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/deploy/consumption-options#reduce_latency)
also supports reducing generated tokens, while warning that a hard cap can
truncate responses. Provider benchmarks alone are not application evidence.

Prices and prior-call/headline retrieval already overlap Gemini. Successful
requests still await those sources and database persistence. Native DuckDB
caches cannot guarantee a fast first archive read; Render Free sleep and
provider load remain separate limits. The 54 backend tests, 10 frontend tests
and production build passed; these correctness checks establish no speedup.
Local checks used the existing Python 3.10 environment; production is configured
for Python 3.11.17.

## Progressive delivery (earlier release)

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
