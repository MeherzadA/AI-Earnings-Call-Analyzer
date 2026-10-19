import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.js";

function QuoteContext({ outlook }) {
  const text = outlook.context || outlook.quote, start = text.indexOf(outlook.quote);
  if (start < 0) return <blockquote><mark>{outlook.quote}</mark></blockquote>;
  const before = Math.max(0, start - 160), end = start + outlook.quote.length, after = Math.min(text.length, end + 160);
  return <blockquote>{before > 0 && "…"}{text.slice(before, start)}<mark>{outlook.quote}</mark>{text.slice(end, after)}{after < text.length && "…"}</blockquote>;
}

export default function ResearchContext({ result, onSource, active, onLoaded }) {
  const [context, setContext] = useState(result.research?.context?.version === 3 ? result.research.context : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const attempted = useRef(false);
  async function load() {
    setLoading(true); setError("");
    try {
      const data = await apiRequest(`/reports/${result.report_id}/context`, { method: "POST" });
      setContext(data.context);
      onLoaded?.(data.context);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!active || context || attempted.current) return;
    attempted.current = true;
    load();
  }, [active, context]);
  const comparison = context?.comparison;
  const otherOutlooks = context?.previous_call.outlooks.filter((outlook) => outlook.quote !== comparison?.outlook?.quote) || [];
  const targetPeriod = `Q${result.quarter} FY${result.year}`;
  const baselinePeriod = `Q${result.quarter} FY${result.year - 1}`;
  return <section className="research-context" aria-labelledby="context-title">
    <div className="section-heading"><div><p className="eyebrow">EXPECTATION → OUTCOME</p><h2 id="context-title">Did revenue deliver on management’s outlook?</h2></div></div>
    <p className="section-description">The previous call looked ahead to this quarter. Here we connect that revenue expectation with what the company now reports, so you can assess how the outcome lined up.</p>
    {!context && !error && <div className="context-load card" role="status"><h3>Loading the earlier outlook…</h3><p>This loads automatically when you open this view and is then saved. No additional Gemini call.</p></div>}
    {error && <div className="error-banner" role="alert"><p>{error}</p><button type="button" className="text-btn" disabled={loading} onClick={load}>Retry loading context</button></div>}
    {context && <>
      <p className="context-stamp">Call date: {context.call_date} · Saved {new Date(context.loaded_at).toLocaleDateString()} · No additional AI generation</p>
      <section className="context-card card" aria-labelledby="outlook-title">
        <p className="guidance-connection">Expected {targetPeriod} <span aria-hidden="true">→</span> Actual {targetPeriod}<span>Forecast made during the Q{context.previous_call.quarter} FY{context.previous_call.year} call.{comparison.status === "directional" && ` Both sides compare ${targetPeriod} with ${baselinePeriod}.`}</span></p>
        <div className="context-card-heading"><h3 id="outlook-title">{comparison.headline}</h3><span className="context-status">{comparison.status === "directional" ? "Direction only · no exact target" : comparison.status === "compared" ? "Compared with management’s target" : "Not enough matching evidence"}</span></div>
        {comparison.outlook ? <>
          <div className="comparison-values">
            <div className="previous-value"><span>FORECAST FOR {targetPeriod}</span><strong>{comparison.status === "directional" ? `Revenue broadly unchanged vs ${baselinePeriod}` : comparison.expected}</strong><p>Looking ahead to {targetPeriod} from the Q{context.previous_call.quarter} FY{context.previous_call.year} call.</p><details className="prior-outlook"><summary>Read the earlier forecast</summary><QuoteContext outlook={comparison.outlook} /></details></div>
            <div className="current-value"><span>ACTUAL RESULT FOR {targetPeriod}</span><strong>{comparison.reported?.value}</strong>{comparison.actual_change && <p className="actual-change">{comparison.actual_change.replace("year over year", `vs ${baselinePeriod}`)}</p>}<p>Reported for {targetPeriod} in the call dated {context.call_date}.</p>{comparison.reported?.citations.map((citation, i) => <details className="prior-outlook" key={i}><summary>Read the reported result</summary><blockquote><mark>{citation.quote}</mark></blockquote><button type="button" className="text-btn" onClick={() => onSource(citation)}>Open in this call’s transcript ↗</button></details>)}</div>
          </div>
          <div className="guidance-takeaway"><h4>WHAT THIS TELLS YOU</h4><p>{comparison.takeaway}</p></div>
        </> : <><p>{context.previous_call.status === "unavailable" ? context.previous_call.message : comparison.message}</p>{comparison.reported && <p className="context-notice">This quarter’s reported total revenue is {comparison.reported.value}. That amount alone does not show whether an earlier growth forecast was met.</p>}</>}
        {otherOutlooks.length > 0 && <details className="unpaired-outlooks"><summary>{otherOutlooks.length} other earlier {otherOutlooks.length === 1 ? "projection" : "projections"} — not compared</summary><p>These are kept separate because this check cannot connect them to a matching reported result. They are not evidence that management met or missed its outlook.</p>{otherOutlooks.map((outlook, index) => <article className="outlook-quote" key={index}><p className="context-source-label">{outlook.metric_scope === "currency_impact" ? "Currency effect — needs the reported currency impact" : outlook.metric_scope === "segment_or_unclear" ? "Segment revenue — needs a matching segment result" : !outlook.period_explicit ? "The target quarter is unclear" : "Needs a matching growth result or a stated numerical target"}</p><blockquote>{outlook.quote}</blockquote><details className="prior-outlook"><summary>See source context</summary><QuoteContext outlook={outlook} /></details></article>)}</details>}
        <p className="context-limit">{comparison.limitation || "This check covers total-company revenue only. It does not assess every forecast, explain what caused the outcome, or independently verify management’s figures."}</p>
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
