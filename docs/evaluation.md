# How report quality is assessed

The app uses one Gemini call to draft a brief, then runs deterministic source checks. These checks are not a factual-accuracy score or an independent semantic review. At the owner's request, Codex assessed all 18 selected statements during development: **12 judged supported, 6 insufficiently supported, 0 contradicted**. These are AI judgments; **independent human review has not been performed**.

## What runs on each new report

1. The stored transcript is split into numbered, contiguous passages. Gemini receives the full numbered source, not web search results or retrieved fragments.
2. The response must follow a typed schema: at most six findings and four financial highlights. Observations and interpretations are separate fields. Root/schema failures reject the response; invalid individual items can be omitted without another model call.
3. Every citation must name an existing passage. The quoted words, punctuation and case must match a contiguous excerpt there; whitespace differences are allowed. The server records the original character offsets.
4. Digit-based numeric quantities are compared with the cited excerpts, including magnitude, percentage/basis-point units, signs, and explicitly stated currencies. Fiscal-year metadata comes from the request. These conservative checks can reject legitimate paraphrases or shared-unit ranges.
5. Findings with failed checks are removed. If no findings remain, no report is saved. There is no automatic model retry or second AI reviewer.
6. Accepted reports record their source hash, model, prompt/check versions, generation timestamp and omission reasons. The brief is built from retained findings; there is no separately generated unchecked summary.

Opening a saved report, an example, or its transcript uses read-only endpoints and makes no Gemini call. An explicit analysis request with `with_research: true` can upgrade an earlier report; its original fields and prices remain stored. Older clients retain their previous cached-report behavior. A single-process generation gate prevents simultaneous generation on the current free Render instance; it is not a distributed quota manager.

## Observed mechanical results

The initial three candidates use existing AAPL Q1 2024, NVDA Q4 2024 and PYPL Q4 2025 transcripts. The Apple candidate uses `evidence-brief-1`; NVIDIA and PayPal use `evidence-brief-2`, which makes the brevity instructions more explicit. All use `gemini-2.5-flash` and `source-checks-1`. Exact per-report provenance and baseline reports are in the [review dataset](../frontend/public/evaluation/review.json).

| Candidate | Proposed findings | Retained findings | Retained financial highlights |
| --- | ---: | ---: | ---: |
| Apple | 6 | 4 | 4 / 4 |
| NVIDIA | 6 | 3 | 4 / 4 |
| PayPal | 6 | 4 | 4 / 4 |
| Total | 18 | 11 | 12 / 12 |

Seven proposed findings were omitted: four quotation mismatches, two numeric/unit mismatches and one malformed item. **Retention is not accuracy.** These are three selected development candidates, not a random or representative benchmark. They include different prompt versions and do not support a claim about general model performance. Development also exposed schema compatibility and length failures; these were investigated locally rather than hidden behind automatic production retries.

The original saved summaries and lists are preserved as a baseline for comparison. They have not received a human quality score. Current machine-readable results are in [results.json](../frontend/public/evaluation/results.json).

## Semantic review: the question quotation matching cannot answer

The [review evidence](https://earnings-analyzer-vercel2.vercel.app/review.html) contains the first three retained observations and first three non-empty interpretations from each candidate: **18 items**. This selection rule was fixed before review; it does not select only statements that look correct. The page provides the cited excerpts, surrounding passage context, report provenance, and each AI assessment with its reason. The original candidate statements remain frozen, including failures.

For each item a person chooses:

- **Supported:** the source supports the whole statement, including its scope and qualifications.
- **Contradicted:** the source conflicts with the statement.
- **Insufficiently supported:** the statement introduces something the source does not establish, even if it sounds plausible.

Codex applied this rubric to the whole statement using the supplied cited passages and surrounding context. This was a development-time assessment requested by the owner, not an additional Gemini generation or a second-model check running for each visitor. It did not use external fact checks. The nine observations were judged supported; three of nine interpretations were judged supported and six insufficiently supported. No statement was judged contradicted.

| Assessed subset | Supported | Insufficiently supported | Contradicted | Denominator |
| --- | ---: | ---: | ---: | ---: |
| Observations | 9 | 0 | 0 | 9 |
| Interpretations | 3 | 6 | 0 | 9 |
| Total | 12 | 6 | 0 | 18 |

Examples of the extra assertions: Apple Services momentum “across geographies” without geographic support in its cited context; NVIDIA execution “across product lines” inferred from total revenue; and “accelerating demand” inferred from revenue growth without demand-growth comparisons. A calendar interpretation also changed one fewer week in the quarter into “a shorter sales week.” Detailed decisions and reviewer provenance are in [ai-review.json](../frontend/public/evaluation/ai-review.json).

The six interpretations judged insufficient were removed from separate curated display snapshots. Original candidate statements and failure explanations remain in the versioned review dataset. This correction changes only those example interpretations; it does not automatically fix all future generations. Reports record that curation separately from the original model/prompt metadata. Headlines, financial highlights, omitted findings, report completeness and the truth of management statements were outside this 18-item assessment.

AI reviewers can be wrong or share a generator's blind spots. **12 / 18 is the outcome of these particular AI judgments, not measured human accuracy or a universal success rate.** Human-review results remain at zero with no supported fraction. Optional human labels are kept separate; they are never populated from the AI decisions. Browser selections require export/import and do not publish automatically. Both kinds of export identify the exact frozen dataset.

Any future independent human review should publish its own counts, denominator, reviewer and timestamp. Neither review type supports a production-wide accuracy estimate, a completeness measure, or a guarantee about future reports.

## A failure mechanical checks cannot catch

Synthetic transcript: “Sales increased 10% to $20 million. Management expects stable demand.”

An AI correctly quotes the sales sentence, then interprets it as: “Therefore the company will open stores next year.” The quotation and numeric checks can pass. The source does not establish a store-opening plan, so a human should mark that interpretation **insufficiently supported**. This counterexample is preserved as a passing *limitation test* in `backend/test_research.py`; the test does not pretend the semantic error was automatically rejected.

Other unproven properties include causal explanations, correct metric-to-number attribution, company/period interpretation, missing important facts, speaker attribution, and the underlying transcript's accuracy. Excerpts can be shortened misleadingly despite matching exactly. Management statements are not independently audited facts. The source viewer makes context inspectable; it does not solve these limitations.

## Reproduce without consuming AI quota

```powershell
.\venv\Scripts\python.exe -m unittest discover -s backend
cd frontend
npm run test
npm run build
```

The tests use temporary storage, mock providers and synthetic failure examples. They cover fabricated quotations, invalid references, changed quantities/units/currencies, malformed output, partial-item omission, failed generation without partial saves, read-only retrieval, legacy upgrades, source hashes, and review denominators.

Preparing a new worksheet from local candidate snapshots requires no model call. The command refuses to overwrite a dataset that already has assessments; preserve it as a separately versioned set before preparing another:

```powershell
.\venv\Scripts\python.exe backend\evaluate.py --prepare --reports-dir .runtime\evidence-preview
```

Import an optional human review explicitly (the export must declare `review_kind: "human"`; AI assessments declare `"ai"` and are stored separately):

```powershell
.\venv\Scripts\python.exe backend\evaluate.py --review-file path\to\earnings-human-review.json
```

The preparation command needs the private local snapshot directory, which is deliberately excluded from Git. The committed worksheet and results are inspectable without credentials. Generating different candidate reports is a separate, quota-consuming action; tests and worksheet generation never invoke Gemini.

## An interview explanation supported by the current work

“I distinguish output validation from factual reliability. The application checks response structure, exact source quotations and numeric consistency, stores provenance, and exposes transcript context. A fixed 18-statement development review by an AI assistant flagged six unsupported interpretations even though their quotations matched; those interpretations were removed from the curated examples. I preserve the failures and reasons. That is useful debugging evidence, but I have not independently human-validated the reports, so I do not claim a measured semantic accuracy rate or hallucination-free output.”

If a person independently reviews the cases later, report those counts and denominator separately. Do not describe automated test results or AI judgments as human-verified report accuracy.
