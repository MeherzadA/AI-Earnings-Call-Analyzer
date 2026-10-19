import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.js";
import { marketWindow, callDateLabel } from "./reportPresentation.js";

function OutlookQuote({ outlook }) {
  const text = outlook.context || outlook.quote;
  const start = text.indexOf(outlook.quote), end = start + outlook.quote.length;
  return <details className="research-source"><summary>Read the earlier statement</summary><blockquote>{start < 0 ? outlook.quote : <>{start > 160 && "…"}{text.slice(Math.max(0, start - 160), start)}<mark>{outlook.quote}</mark>{text.slice(end, end + 160)}{text.length > end + 160 && "…"}</>}</blockquote></details>;
}

function Headline({ item }) {
  const suffix = ` - ${item.source}`;
  const title = item.title.endsWith(suffix) ? item.title.slice(0, -suffix.length) : item.title;
  return <li><div><span className="publisher-label">{item.source}</span><time dateTime={item.published_at}>{callDateLabel(item.published_at)}</time></div><a href={item.url} target="_blank" rel="noreferrer">{title} <span aria-hidden="true">↗</span></a></li>;
}

export default function ResearchContext({ result, onSource, active }) {
  const [context, setContext] = useState(result.context || result.research?.context || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const attempted = useRef(false);
  async function load() {
    setLoading(true); setError("");
    try { const data = await apiRequest(`/reports/${result.report_id}/context`, { method:"POST" }); setContext(data.context); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (active && !context && !attempted.current) { attempted.current = true; load(); } }, [active, context]);
  const comparison = context?.comparison;
  const paired = comparison?.outlook;
  const otherOutlooks = context?.previous_call.outlooks.filter((item) => item.quote !== paired?.quote) || [];
  const target = `Q${result.quarter} FY${result.year}`;
  const baseline = `Q${result.quarter} FY${result.year - 1}`;
  const headlines = context?.news.items || [];
  return <section className="research-digest" aria-labelledby="research-digest-title">
    <header className="digest-heading"><p className="section-kicker">BEYOND THIS CALL</p><h2 id="research-digest-title">Put management’s story to the test.</h2><p>Earlier expectations, the reported outcome, and coverage around the call.</p></header>
    {!context && !error && <div className="research-loading" role="status"><span className="spinner"/><div><h3>Connecting the sources…</h3><p>Retrieving the earlier call, filing data, and dated coverage.</p></div></div>}
    {error && <div className="error-banner" role="alert"><p>{error}</p><button type="button" className="outline-btn" disabled={loading} onClick={load}>Try research again</button></div>}
    {context && <>
      <div className="source-availability"><span>Call · <strong>{callDateLabel(context.call_date)}</strong></span><span>Earlier call · <strong>{context.previous_call.status === "available" ? "Available" : "Unavailable"}</strong></span><span>Filings · <strong>{context.filings.status === "available" ? "Available" : "Unavailable"}</strong></span><span>Coverage · <strong>{headlines.length} links</strong></span></div>
      <section className={`expectation-card verdict-${comparison.position || comparison.status}`}>
        <div className="digest-section-heading"><div><p className="section-kicker">01 / EXPECTATION & OUTCOME</p><h3>Did {target} deliver?</h3></div>{paired && <span className="verdict-chip">{comparison.status === "directional" ? "Directional comparison" : comparison.position === "above" ? "Above outlook" : comparison.position === "below" ? "Below outlook" : "Within outlook"}</span>}</div>
        {paired ? <>
          <div className="expectation-pair"><article><p className="comparison-label">WHAT MANAGEMENT EXPECTED</p><strong>{comparison.status === "directional" ? `Revenue broadly flat vs ${baseline}` : comparison.expected}</strong><p>For {target}, stated in the Q{context.previous_call.quarter} FY{context.previous_call.year} call.</p><OutlookQuote outlook={paired}/></article><article><p className="comparison-label">WHAT IT REPORTED</p><strong>{comparison.reported?.value}</strong>{comparison.actual_change && <b className="comparison-yoy">{comparison.actual_change.replace("year over year", `vs ${baseline}`)}</b>}<p>{target} · Call held {callDateLabel(context.call_date)}</p>{comparison.reported?.citations.map((citation,i)=><details className="research-source" key={i}><summary>Inspect the reported result</summary><blockquote>{citation.quote}</blockquote><button type="button" className="text-btn" onClick={()=>onSource(citation)}>Open in transcript →</button></details>)}</article></div>
          <div className="comparison-conclusion"><strong>What this tells you</strong><p>{comparison.takeaway}</p></div>
        </> : <div className="unpaired-research"><p>{context.previous_call.status === "unavailable" ? "The earlier call could not be retrieved. The sources below still give you context for this call." : comparison.message}</p>{comparison.reported && <div className="reported-revenue"><span>{target} revenue reported</span><strong>{comparison.reported.value}</strong>{comparison.reported.citations?.[0] && <button type="button" className="text-btn" onClick={()=>onSource(comparison.reported.citations[0])}>Inspect source →</button>}</div>}</div>}
        {otherOutlooks.length > 0 && <div className="earlier-outlooks"><h4>{paired ? "Other outlooks to inspect" : "What management had said"}</h4>{otherOutlooks.map((outlook,i)=><article key={i}><span className="outlook-scope">{outlook.metric_scope === "currency_impact" ? "Currency effect" : outlook.metric_scope === "segment_or_unclear" ? "Segment / scope needs review" : "Revenue outlook"}</span><p>{outlook.quote}</p><small>{outlook.period_explicit ? `Looking ahead to ${target}` : "Target period needs review"} · Not automatically scored</small><OutlookQuote outlook={outlook}/></article>)}</div>}
        <details className="research-method"><summary>Comparison method & limits</summary><p>{comparison.limitation || "Only directly comparable total-company revenue can receive a numerical verdict. Ambiguous periods, segment mismatches, and qualitative expectations remain unscored."} This compares management statements, not analyst consensus. Older reports may use a literal, source-linked revenue extraction; that is not an independent semantic review.</p></details>
      </section>
      <div className="outside-research-grid">
        <section className="filing-digest"><div className="digest-section-heading"><div><p className="section-kicker">02 / COMPANY FILINGS</p><h3>Check the filed figures</h3></div></div>
          {context.filings.status === "available" ? <>{context.filings.facts?.map((fact,i)=><article className="filed-figure" key={i}><span>{fact.label}</span><strong>{fact.value}</strong><p>{fact.period_start} → {fact.period_end}<br/>{fact.form} · Filed {callDateLabel(fact.filed)}</p><a href={fact.url} target="_blank" rel="noreferrer">Read filing ↗</a></article>)}</> : <p className="provider-note">No comparable filing figures are available from the provider for this call. No filing cross-check is claimed.</p>}
          <a className="filing-link" href={context.filings.browse_url || `https://www.sec.gov/edgar/browse/?CIK=${result.ticker}&owner=exclude`} target="_blank" rel="noreferrer">Browse {result.ticker} filings at the SEC ↗</a><details className="research-method"><summary>Source availability</summary><p>{context.filings.message} Company filings are a separate company-authored source; they are not an audit of every report claim.</p></details>
        </section>
        <section className="coverage-digest"><div className="digest-section-heading"><div><p className="section-kicker">03 / OUTSIDE COVERAGE</p><h3>What was being reported</h3></div><span className="coverage-badge">Article links</span></div>
          <p className="coverage-dates">{context.news.start ? `${callDateLabel(context.news.start)} – ${callDateLabel(context.news.end)}` : "Coverage around the call"} · UTC publication dates</p>
          <ul className="coverage-list">{headlines.slice(0,3).map((item,i)=><Headline key={i} item={item}/>)}</ul>{headlines.length>3 && <details className="research-method"><summary>{headlines.length-3} more headlines</summary><ul className="coverage-list">{headlines.slice(3).map((item,i)=><Headline key={i} item={item}/>)}</ul></details>}
          {!headlines.length && <p className="provider-note">{context.news.message || "No matching historical headlines were returned by the feed."}</p>}
          <details className="research-method"><summary>Headlines versus the price chart</summary><p>{marketWindow(result)} A headline can describe an after-hours or intraday move; the article’s exact price window is not verified by this feed.</p></details>
          <p className="coverage-disclosure">Headlines are further reading. Article contents have not been analysed or used as evidence for the AI brief.</p>
        </section>
      </div>
    </>}
  </section>;
}
