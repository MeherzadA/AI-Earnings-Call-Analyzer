import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.js";

function QuoteContext({ outlook }) {
  const text = outlook.context || outlook.quote, start = text.indexOf(outlook.quote);
  if (start < 0) return <blockquote><mark>{outlook.quote}</mark></blockquote>;
  const before = Math.max(0, start - 160), end = start + outlook.quote.length, after = Math.min(text.length, end + 160);
  return <blockquote>{before > 0 && "…"}{text.slice(before, start)}<mark>{outlook.quote}</mark>{text.slice(end, after)}{after < text.length && "…"}</blockquote>;
}

export default function ResearchContext({ result, onSource, active }) {
  const [context, setContext] = useState(result.research?.context?.version === 2 ? result.research.context : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const attempted = useRef(false);
  async function load() {
    setLoading(true); setError("");
    try {
      const data = await apiRequest(`/reports/${result.report_id}/context`, { method: "POST" });
      setContext(data.context);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!active || context || attempted.current) return;
    attempted.current = true;
    load();
  }, [active, context]);
  return <section className="research-context" aria-labelledby="context-title">
    <div className="section-heading"><div><p className="eyebrow">REVENUE OUTLOOK VS. RESULTS</p><h2 id="context-title">What was projected—and what happened?</h2></div></div>
    <p className="section-description">Compare management’s forecast from the preceding call with revenue reported in this call. Different metrics or fiscal periods cannot fairly be compared.</p>
    {!context && !error && <div className="context-load card" role="status"><h3>Loading the earlier outlook…</h3><p>This loads automatically when you open this view and is then saved. No additional Gemini call.</p></div>}
    {error && <div className="error-banner" role="alert"><p>{error}</p><button type="button" className="text-btn" disabled={loading} onClick={load}>Retry loading context</button></div>}
    {context && <>
      <p className="context-stamp">Call date: {context.call_date} · Saved {new Date(context.loaded_at).toLocaleDateString()} · No additional AI generation</p>
      <section className="context-card card" aria-labelledby="outlook-title">
        <div className="context-card-heading"><h3 id="outlook-title">{context.comparison.status === "compared" ? `Revenue came in ${context.comparison.position} the earlier range` : "A fair numerical comparison isn’t available"}</h3></div>
        <p>{context.comparison.message}</p>
        <div className="comparison-values"><div className="previous-value"><span>1 · EARLIER OUTLOOK</span><h4>From the Q{context.previous_call.quarter} FY{context.previous_call.year} call</h4><strong>{context.comparison.range || "No comparable range identified"}</strong><p>What management projected for the coming quarter.</p></div><div className="current-value"><span>2 · CURRENT RESULT</span><h4>Reported for Q{result.quarter} FY{result.year}</h4><strong>{context.comparison.reported?.value || "No comparable revenue value saved"}</strong><p>Call dated {context.call_date}.</p>{context.comparison.reported?.citations.map((citation, i) => <button key={i} type="button" className="text-btn" onClick={() => onSource(citation)}>Inspect this reported value ↗</button>)}</div></div>
        {context.previous_call.outlooks.length > 0 && <h4>Forecast statements found in the preceding call</h4>}
        {context.previous_call.outlooks.map((outlook, index) => <article className="outlook-quote" key={index}><p className="context-source-label">Q{context.previous_call.quarter} FY{context.previous_call.year} · {outlook.passage_id}{outlook.metric_scope === "segment_or_unclear" ? " · Segment scope; not compared with company-wide revenue" : ""}</p><blockquote>{outlook.quote}</blockquote><details className="prior-outlook"><summary>See surrounding context</summary><p>The exact quoted sentence is highlighted.</p><QuoteContext outlook={outlook} /></details></article>)}
        {!context.previous_call.outlooks.length && <p className="context-notice">{context.previous_call.message || "No explicit revenue forecast was identified. Disclaimers and past results are not substituted for guidance."}</p>}
        <p className="context-limit">{context.comparison.limitation || "Qualitative guidance, ambiguous periods and missing comparable metrics are left unscored."}</p>
      </section>
      {context.filings.status !== "available" && <details className="filing-unavailable"><summary>SEC filing check unavailable — no filing figures verified</summary><p>{context.filings.message}</p><a href={context.filings.browse_url || `https://www.sec.gov/edgar/browse/?CIK=${result.ticker}&owner=exclude`} target="_blank" rel="noreferrer">Browse company filings manually ↗</a></details>}
      <div className="external-context-grid">
        {context.filings.status === "available" && <section className="context-card card" aria-labelledby="filing-title"><div className="context-card-heading"><h3 id="filing-title">Company filing figures</h3><span className="context-status">Separate source</span></div>
          <p>{context.filings.message}</p>
          {context.filings.facts?.map((fact, i) => <article className="filing-fact" key={i}><h4>{fact.label}</h4><strong>{fact.value}</strong><p>{fact.period_start} – {fact.period_end}<br/>{fact.form} filed {fact.filed}</p><a href={fact.url} target="_blank" rel="noreferrer">Open filing record ↗</a></article>)}
          <a href={context.filings.browse_url || `https://www.sec.gov/edgar/browse/?CIK=${result.ticker}&owner=exclude`} target="_blank" rel="noreferrer">Browse {result.ticker} filings at the SEC ↗</a>
          <p className="context-limit">Select filings for this fiscal period when browsing. A source link is not a completed cross-check. Filing figures may use more precision than the call.</p>
        </section>}
        <section className="context-card coverage-card card" aria-labelledby="news-title"><div className="context-card-heading"><h3 id="news-title">Related coverage</h3><span className="context-status">Headline links · Articles not analysed</span></div>
          {context.news.start && <p>Published {context.news.start} – {context.news.end} (UTC). These links are further reading, not article summaries or verified evidence for the brief.</p>}
          <ul className="news-list">{context.news.items?.map((item, i) => <li key={i}><p>{item.source} · {item.published_at.slice(0, 10)}</p><a href={item.url} target="_blank" rel="noreferrer">{item.title} ↗</a></li>)}</ul>
          {!context.news.items?.length && <p className="context-notice">{context.news.message || "No matching dated headlines were returned. Feed coverage is incomplete."}</p>}
          <p className="context-limit">{context.news.limitation || "Headlines are links for further reading, not verified article contents or evidence used to generate this brief."}</p>
        </section>
      </div>
    </>}
  </section>;
}
