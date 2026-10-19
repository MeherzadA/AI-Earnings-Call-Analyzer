import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.js";
import CoverageBoard from "./CoverageBoard.jsx";
import { callDateLabel } from "./reportPresentation.js";

export default function ResearchContext({ result, onSource, active }) {
  const stored = result.context || result.research?.context;
  const [context, setContext] = useState(stored?.version === 6 ? stored : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const attempted = useRef(false);
  const [selected, setSelected] = useState(0);
  const retrySources = context && ["previous_call", "news"].some((section) => context[section]?.status === "unavailable");
  async function load() {
    setLoading(true); setError("");
    try { const data = await apiRequest(`/reports/${result.report_id}/context`, { method:"POST" }); setContext(data.context); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (active && (!context || retrySources) && !attempted.current) { attempted.current = true; load(); } }, [active, context, retrySources]);
  const matched = context ? [{...context.comparison, metric:"Total company revenue"}, ...(context.additional_comparisons || [])].filter(item=>item.outlook) : [];
  const comparison = matched[selected] || context?.comparison;
  const metric = comparison?.metric || "Total company revenue";
  const flatRevenue = metric === "Total company revenue" && comparison?.status === "directional";
  const forecast = comparison?.outlook;
  const reported = comparison?.reported;
  const target = `Q${result.quarter} FY${result.year}`;
  const baseline = `Q${result.quarter} FY${result.year - 1}`;
  const priorPeriod = context ? `Q${context.previous_call.quarter} FY${context.previous_call.year}` : "";
  const verdict = comparison?.headline;
  return <section className="research-digest comparison-workspace" aria-labelledby="research-digest-title">
    <header className="digest-heading"><h2 id="research-digest-title">Forecast vs. reported</h2><p>Management’s forecast for <strong>{target}</strong> compared with the reported result for <strong>the same quarter</strong>.</p></header>
    {!context && !error && <div className="research-loading" role="status"><span className="spinner"/><p>Loading the earlier forecast and this quarter’s result…</p></div>}
    {error && <div className="error-banner" role="alert"><p>{error}</p><button type="button" className="outline-btn" disabled={loading} onClick={load}>Retry research</button></div>}
    {context && <>
      {matched.length > 1 && <div className="comparison-picker"><strong>Compare</strong><div role="group" aria-label="Choose a comparison">{matched.map((item,i)=><button type="button" key={item.metric} aria-pressed={selected === i} onClick={()=>setSelected(i)}>{item.metric}</button>)}</div></div>}
      <section className="revenue-diff" key={metric} aria-label={`${target} ${metric} forecast compared with actual result`}>
        <div className="diff-file-heading"><strong>{metric}</strong><span>Reporting period · {target}</span></div>
        {forecast ? <>
          <div className="diff-result"><div><h3>{verdict}</h3><p>{comparison.takeaway.split("'Similar'")[0].trim()}</p></div></div>
          <div className="diff-columns">
            <article className="forecast-side"><header><div className="diff-step"><b>BEFORE</b><span>Forecast</span></div><h4>Expected for {target}</h4><p>Given during the <strong>{priorPeriod}</strong> call{context.previous_call.report_date ? ` · ${callDateLabel(context.previous_call.report_date)}` : ""}</p></header><div className="diff-value"><strong>{flatRevenue ? "Roughly flat revenue" : comparison.expected}</strong><span>{comparison.status === "directional" ? `Compared with ${baseline}` : "Management’s stated forecast range"}</span></div><div className="diff-evidence"><p>Forecast transcript excerpt</p><blockquote>“{forecast.quote}”</blockquote><small>Source: {priorPeriod} call transcript · {forecast.passage_id}</small></div></article>
            <article className="actual-side"><header><div className="diff-step"><b>AFTER</b><span>Reported</span></div><h4>Reported for {target}</h4><p>Reported in <strong>this call</strong> · {callDateLabel(context.call_date)}</p></header><div className="diff-value"><strong>{reported?.value}</strong><span>{comparison.actual_change ? comparison.actual_change.replace("year over year", `vs ${baseline}`) : `${metric} reported`}</span></div><div className="diff-evidence"><p>Result transcript excerpt</p>{reported?.citations?.[0] && <><blockquote>“{reported.citations[0].quote}”</blockquote><button type="button" className="text-btn" onClick={()=>onSource(reported.citations[0])}>Read in transcript</button></>}</div></article>
          </div>
          <div className="diff-scope"><strong>What is being compared?</strong><p>The left side is a forecast <em>for {target}</em>, made one call earlier. The right side is the actual result <em>for {target}</em>. {flatRevenue && <>Both growth statements use {baseline} as their year-over-year baseline. “Roughly flat” has no exact tolerance, so this is a direction check rather than a numerical beat or miss.</>}</p><p>Management’s outlook is being assessed here—not analyst estimates. {metric === "Total company revenue" ? "Segment forecasts and currency comments are excluded from this company-revenue comparison." : comparison.limitation}</p></div>
        </> : <div className="no-fair-comparison"><h3>No fair forecast-to-result comparison is available</h3><p>{context.previous_call.status === "unavailable" ? "The earlier call could not be retrieved, so we cannot show its forecast alongside this result." : comparison.message}</p>{reported && <div className="unpaired-actual"><span>{target} revenue reported</span><strong>{reported.value}</strong>{reported.citations?.[0] && <><blockquote>“{reported.citations[0].quote}”</blockquote><button type="button" className="text-btn" onClick={()=>onSource(reported.citations[0])}>Read result in transcript ↗</button></>}</div>}<p className="comparison-footnote">Unmatched statements are omitted instead of being placed beside an unrelated result.</p></div>}
      </section>
      <CoverageBoard news={context.news} result={result}/>
      {retrySources && <button type="button" className="text-btn source-retry" disabled={loading} onClick={load}>{loading ? "Retrying unavailable sources…" : "Retry unavailable sources"}</button>}
    </>}
  </section>;
}
