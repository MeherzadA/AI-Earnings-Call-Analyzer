import { useState } from "react";
import { apiRequest } from "./api.js";

export default function ResearchContext({ result, onSource }) {
  const [context, setContext] = useState(result.research?.context || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true); setError("");
    try {
      const data = await apiRequest(`/reports/${result.report_id}/context`, { method: "POST" });
      setContext(data.context);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  return <section className="research-context" aria-labelledby="context-title">
    <div className="section-heading"><div><p className="eyebrow">BEYOND THIS CALL</p><h2 id="context-title">Put the story in context</h2></div></div>
    <p className="section-description">Compare an earlier outlook with reported results, inspect available filing data, and explore dated news links. Company filings are also company-authored; additional sources do not guarantee an impartial account.</p>
    {!context && <div className="context-load card"><h3>Load research for this saved call</h3><p>Fetches the preceding fiscal call and dated public sources once, then saves the result. It makes no extra Gemini call and does not rewrite the brief.</p><button type="button" className="outline-btn" disabled={loading} onClick={load}>{loading ? "Loading prior call and sources…" : "Load research context ↗"}</button></div>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    {context && <>
      <p className="context-stamp">Call date: {context.call_date} · Saved {new Date(context.loaded_at).toLocaleDateString()} · No additional AI generation</p>
      <section className="context-card card" aria-labelledby="outlook-title">
        <div className="context-card-heading"><h3 id="outlook-title">Earlier outlook vs. reported result</h3><span className="context-status">{context.comparison.status === "compared" ? "Stated-value comparison" : "Not automatically scored"}</span></div>
        <p>{context.comparison.message}</p>
        {context.comparison.status === "compared" && <div className="comparison-values"><div><span>Prior revenue outlook</span><strong>{context.comparison.range}</strong></div><div><span>Reported revenue</span><strong>{context.comparison.actual}</strong></div></div>}
        {context.comparison.reported && <div className="comparison-reported"><p>Reported in this call: <strong>{context.comparison.reported.value}</strong></p>{context.comparison.reported.citations.map((citation, i) => <button key={i} type="button" className="text-btn" onClick={() => onSource(citation)}>Inspect reported-value source ↗</button>)}</div>}
        <h4>Previous call · Q{context.previous_call.quarter} {context.previous_call.year}</h4>
        {context.previous_call.outlooks.map((outlook, index) => <details className="prior-outlook" key={index}><summary>{outlook.quote}</summary><p className="context-source-label">Original preceding-call passage · {outlook.passage_id}</p><blockquote>{outlook.context}</blockquote><p>Fiscal-period attribution {outlook.period_explicit ? "has an explicit quarter reference" : "is not explicit enough for automatic scoring"}. {outlook.metric_scope === "segment_or_unclear" && "Segment guidance is not compared with total-company revenue."}</p></details>)}
        {!context.previous_call.outlooks.length && <p className="context-notice">{context.previous_call.message || "No concise revenue-outlook passage was identified. That does not establish there was no guidance."}</p>}
        <p className="context-limit">{context.comparison.limitation || "Qualitative guidance, ambiguous periods and missing comparable metrics are left unscored."}</p>
      </section>
      <div className="external-context-grid">
        <section className="context-card card" aria-labelledby="filing-title"><div className="context-card-heading"><h3 id="filing-title">Filing evidence</h3><span className="context-status">{context.filings.status === "available" ? "Company-filed data" : "Not checked"}</span></div>
          <p>{context.filings.message}</p>
          {context.filings.facts?.map((fact, i) => <article className="filing-fact" key={i}><h4>{fact.label}</h4><strong>{fact.value}</strong><p>{fact.period_start} – {fact.period_end}<br/>{fact.form} filed {fact.filed}</p><a href={fact.url} target="_blank" rel="noreferrer">Open filing record ↗</a></article>)}
          <a href={context.filings.browse_url || `https://www.sec.gov/edgar/browse/?CIK=${result.ticker}&owner=exclude`} target="_blank" rel="noreferrer">Browse {result.ticker} filings at the SEC ↗</a>
          <p className="context-limit">Select filings for this fiscal period when browsing. A source link is not a completed cross-check. Filing figures may use more precision than the call.</p>
        </section>
        <section className="context-card card" aria-labelledby="news-title"><div className="context-card-heading"><h3 id="news-title">Around the call</h3><span className="context-status">External headlines</span></div>
          {context.news.start && <p>{context.news.start} – {context.news.end} · UTC publication dates</p>}
          <ul className="news-list">{context.news.items?.map((item, i) => <li key={i}><p>{item.source} · {item.published_at.slice(0, 10)}</p><a href={item.url} target="_blank" rel="noreferrer">{item.title} ↗</a></li>)}</ul>
          {!context.news.items?.length && <p className="context-notice">{context.news.message || "No matching dated headlines were returned. Feed coverage is incomplete."}</p>}
          <p className="context-limit">{context.news.limitation || "Headlines are links for further reading, not verified article contents or evidence used to generate this brief."}</p>
        </section>
      </div>
    </>}
  </section>;
}
