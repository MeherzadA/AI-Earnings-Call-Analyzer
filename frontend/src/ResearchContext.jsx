import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.js";
import { marketWindow, callDateLabel } from "./reportPresentation.js";

function Headline({ item }) {
  const suffix = ` - ${item.source}`;
  return <li><div><span className="publisher-label">{item.source}</span><time dateTime={item.published_at}>{callDateLabel(item.published_at)}</time></div><a href={item.url} target="_blank" rel="noreferrer">{item.title.endsWith(suffix) ? item.title.slice(0, -suffix.length) : item.title} ↗</a></li>;
}

export default function ResearchContext({ result, onSource, active }) {
  const stored = result.context || result.research?.context;
  const [context, setContext] = useState(stored?.version === 5 ? stored : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const attempted = useRef(false);
  const retrySources = context && ["previous_call", "news"].some((section) => context[section]?.status === "unavailable");
  async function load() {
    setLoading(true); setError("");
    try { const data = await apiRequest(`/reports/${result.report_id}/context`, { method:"POST" }); setContext(data.context); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (active && (!context || retrySources) && !attempted.current) { attempted.current = true; load(); } }, [active, context, retrySources]);
  const comparison = context?.comparison;
  const forecast = comparison?.outlook;
  const reported = comparison?.reported;
  const target = `Q${result.quarter} FY${result.year}`;
  const baseline = `Q${result.quarter} FY${result.year - 1}`;
  const priorPeriod = context ? `Q${context.previous_call.quarter} FY${context.previous_call.year}` : "";
  const headlines = context?.news.items || [];
  const verdict = comparison?.status === "directional" ? comparison.headline : comparison?.position === "above" ? "Revenue exceeded the forecast range" : comparison?.position === "below" ? "Revenue fell short of the forecast range" : "Revenue landed within the forecast range";
  return <section className="research-digest comparison-workspace" aria-labelledby="research-digest-title">
    <header className="digest-heading"><p className="section-kicker">MANAGEMENT’S FORECAST → ACTUAL RESULT</p><h2 id="research-digest-title">Did the revenue outlook hold up?</h2><p>What management expected for <strong>{target}</strong>, compared with what it later reported for <strong>that same quarter</strong>.</p></header>
    {!context && !error && <div className="research-loading" role="status"><span className="spinner"/><p>Loading the earlier forecast and this quarter’s result…</p></div>}
    {error && <div className="error-banner" role="alert"><p>{error}</p><button type="button" className="outline-btn" disabled={loading} onClick={load}>Retry research</button></div>}
    {context && <>
      <section className="revenue-diff" aria-label={`${target} revenue forecast compared with actual revenue`}>
        <div className="diff-file-heading"><strong>Total company revenue</strong><span>Reporting period · {target}</span></div>
        {forecast ? <>
          <div className="diff-result"><span aria-hidden="true">↔</span><div><h3>{verdict}</h3><p>{comparison.takeaway.split("'Similar'")[0].trim()}</p></div></div>
          <div className="diff-columns">
            <article className="forecast-side"><header><span className="diff-step">BEFORE · FORECAST</span><h4>Expected for {target}</h4><p>Given during the <strong>{priorPeriod}</strong> call{context.previous_call.report_date ? ` · ${callDateLabel(context.previous_call.report_date)}` : ""}</p></header><div className="diff-value"><strong>{comparison.status === "directional" ? "Roughly flat revenue" : comparison.expected}</strong><span>{comparison.status === "directional" ? `Compared with ${baseline}` : "Management’s stated revenue range"}</span></div><div className="diff-evidence"><p>Management’s exact forecast</p><blockquote>“{forecast.quote}”</blockquote><small>Source: {priorPeriod} call transcript · {forecast.passage_id}</small></div></article>
            <article className="actual-side"><header><span className="diff-step">AFTER · ACTUAL RESULT</span><h4>Reported for {target}</h4><p>Reported in <strong>this call</strong> · {callDateLabel(context.call_date)}</p></header><div className="diff-value"><strong>{reported?.value}</strong><span>{comparison.actual_change ? comparison.actual_change.replace("year over year", `vs ${baseline}`) : "Total company revenue reported"}</span></div><div className="diff-evidence"><p>Management’s exact reported result</p>{reported?.citations?.[0] && <><blockquote>“{reported.citations[0].quote}”</blockquote><button type="button" className="text-btn" onClick={()=>onSource(reported.citations[0])}>Read result in transcript ↗</button></>}</div></article>
          </div>
          <div className="diff-scope"><strong>What is being compared?</strong><p>The left side is a forecast <em>for {target}</em>, made one call earlier. The right side is the actual result <em>for {target}</em>. {comparison.status === "directional" && <>Both growth statements use {baseline} as their year-over-year baseline. “Roughly flat” has no exact tolerance, so this is a direction check rather than a numerical beat or miss.</>}</p><p>Management’s outlook is being assessed here—not analyst estimates. Segment forecasts and currency comments are excluded from this company-revenue comparison.</p></div>
        </> : <div className="no-fair-comparison"><h3>No fair forecast-to-result comparison is available</h3><p>{context.previous_call.status === "unavailable" ? "The earlier call could not be retrieved, so we cannot show its forecast alongside this result." : comparison.message}</p>{reported && <div className="unpaired-actual"><span>{target} revenue reported</span><strong>{reported.value}</strong>{reported.citations?.[0] && <><blockquote>“{reported.citations[0].quote}”</blockquote><button type="button" className="text-btn" onClick={()=>onSource(reported.citations[0])}>Read result in transcript ↗</button></>}</div>}<p className="comparison-footnote">Unmatched statements are omitted instead of being placed beside an unrelated result.</p></div>}
      </section>
      <section className="coverage-digest"><div className="digest-section-heading"><div><p className="section-kicker">COVERAGE AROUND THE CALL</p><h3>Related reporting</h3></div><span className="coverage-badge">{headlines.length} article links</span></div><p className="coverage-dates">{context.news.start ? `${callDateLabel(context.news.start)} – ${callDateLabel(context.news.end)}` : "Around the call"} · UTC publication dates</p><ul className="coverage-list">{headlines.map((item,i)=><Headline key={i} item={item}/>)}</ul>{!headlines.length && <p>{context.news.message || "The feed returned no matching historical headlines."}</p>}<p className="coverage-disclosure">{marketWindow(result)} A headline may describe a different after-hours or intraday window. These are reading links; article contents have not been analysed or used as evidence for the brief.</p></section>
      {retrySources && <button type="button" className="text-btn source-retry" disabled={loading} onClick={load}>{loading ? "Retrying unavailable sources…" : "Retry unavailable sources"}</button>}
    </>}
  </section>;
}
