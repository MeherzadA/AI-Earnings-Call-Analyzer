# Research context

The core business brief is generated from one call transcript, with one Gemini call. Every new analysis also attempts prior-call, filing and dated-coverage research before returning. A context-provider failure preserves the completed analysis, so a retry does not spend another Gemini call. `POST /reports/{id}/context` stores a snapshot inside the existing `research_json` field. Current successful or empty source responses stay cached. Unavailable sources retry once when opening Research, or with **Retry unavailable sources**; failures are not permanently cached as completed research. Opening an older report can use the same loader without regenerating its AI statements. External data availability cannot be guaranteed, and missing evidence is never invented. Original report fields remain intact; no schema migration or paid service is required.

## Previous guidance and reported results

The backend reuses a stored preceding fiscal transcript where available, otherwise retrieves that one call through the existing range-read provider. It extracts up to three short revenue-outlook sentences and preserves their original numbered passage context and source hash.

Context version 3 connects an identified earlier forecast to the selected quarter's reported result and gives an explicit takeaway. It retains version 2's rejection of disclaimers and past results. Older snapshots are rebuilt, reusing external-source snapshots for the same call date.

Alongside numerical ranges, a narrowly supported directional case handles an outlook of revenue "similar" to the prior year when the saved revenue citation supplies an explicit year-over-year percentage for the same quarter. An explicit quarter reference or the same named month-quarter in both source statements is required. For example, Apple's FY2023 Q4 call expected December-quarter revenue similar to last year; FY2024 Q1 reports $119.6 billion, up 2%. The UI shows that connection without inventing a numerical tolerance for "similar" or declaring an exact beat. Adjusted/constant-currency forecasts are not compared with an unadjusted growth figure. Currency impacts and segment projections are kept in a separate, collapsed group with the missing comparison explained.

For an identified quarterly company-revenue range, explicit dollar ranges and plus/minus percentage tolerances are supported. The comparison reports above, within or below management's range, including the amount outside a boundary; it is not an analyst-consensus beat/miss. Annual guidance, known segment scopes, unclear fiscal-period references and missing matching results remain unscored. Segment guidance is not added together or silently compared with total revenue.

This is a conservative extraction heuristic, not a semantic proof. It can miss valid guidance, misidentify a scope not covered by its rules, and encounter rounded amounts or transcript errors. The original passages remain inspectable. A matched range is not evidence of good management, future returns, or complete coverage. No general extraction-accuracy claim is made.

## SEC filing evidence

The app uses the SEC issuer map and Company Facts API when reachable. It looks for directly reported quarterly US-GAAP revenue available through the call's calendar date, with matching filing fiscal metadata and a plausible quarter duration. It does not substitute calendar quarters for fiscal quarters, use later filings silently, derive fourth-quarter figures from annual reports, or manufacture a value if no match is found.

The source, period, form, filing date and taxonomy tag accompany any result. Company-filed data is not independent auditing. Intraday filing availability is not verified, and numeric precision may differ from management's rounded remarks. The displayed figure is not a claim that every report statement was checked.

In this development environment, SEC automated endpoints returned HTTP 403. The app therefore shows **Not checked**, the provider failure, and a direct company-filings link. Links alone do not count as completed verification. No proxy or paid fallback was added. Optional `SEC_USER_AGENT` identifies the application to SEC servers; fetching is sequential and results are cached.

References: [SEC API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [SEC developer resources](https://www.sec.gov/about/developer-resources).

## Dated news

Google News RSS supplies up to five headline links from distinct publishers in the fourteen days through the call's UTC calendar date. Publication timestamps are filtered again after fetching. Current news is not attached to an older call. Same-day headlines may still have been published after the call; exact call-time ordering is not claimed. Historical feed coverage can be incomplete.

The app displays publisher, publication date and headline. It does not read, summarize, independently verify or feed article contents into Gemini. Headlines are further-reading context, not accepted factual evidence for the existing brief. A range of publishers is not a guarantee of neutrality.

## Focused checks

New checks cover a quarterly range versus annual/segment/wrong-metric cases, rejection of future-dated or unsafe news links, and context caching without another model call. UI checks exercise each view and keyboard navigation once on a saved report. Existing semantic-review results describe their original fixed sample; this feature has no new human-verified accuracy claim.
