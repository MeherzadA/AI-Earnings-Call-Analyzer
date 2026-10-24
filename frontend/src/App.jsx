import { useState, useMemo, useEffect, useRef } from "react";
import MarketPanel from "./MarketPanel.jsx";
import { apiRequest, streamAnalysis } from "./api.js";
import ResearchReport, { SourceViewer, FindingCard } from "./ResearchReport.jsx";
import { reportIdFromSearch, reportUrl } from "./reportNavigation.js";
import { callDateLabel } from "./reportPresentation.js";
import { animateStockStrip } from "./stockStrip.js";

const COMPANIES = { AAPL: "Apple", NVDA: "NVIDIA", PYPL: "PayPal", MSFT: "Microsoft" };

function CompanyMark({ ticker }) {
  const logo = { AAPL: "apple", NVDA: "nvidia", PYPL: "paypal", MSFT: "microsoft" }[ticker];
  return <span className="company-mark" data-company={ticker} aria-hidden="true">{logo ? <img src={`/logos/${logo}.svg`} alt="" /> : ticker.slice(0, 2)}</span>;
}

function currentQuarter(date) {
  const month = date.getMonth() + 1;
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

function SearchBar({ onSubmit, loading, period, reports }) {
  const today = useMemo(() => new Date(), []);
  const completedPeriod = useMemo(() => new Date(today.getFullYear(), today.getMonth() - 3, 1), [today]);
  const [ticker, setTicker] = useState("");
  const [year, setYear] = useState(completedPeriod.getFullYear());
  const [quarter, setQuarter] = useState(currentQuarter(completedPeriod));
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [coverage, setCoverage] = useState(null);
  const [lookup, setLookup] = useState(null);
  const symbol = ticker.trim().toUpperCase();
  const saved = reports.find((item) => item.ticker === symbol && item.year === Number(year) && Number(item.quarter) === Number(quarter));
  const checked = coverage?.ticker === symbol ? coverage : null;
  const chooseCompany = lookup?.query === symbol && lookup.companies.length > 0 && !lookup.companies.some((item) => item.symbol === symbol);
  const selectedCall = checked?.periods?.find((item) => item.year === Number(year) && item.quarter === Number(quarter));
  const unavailable = !saved && checked?.periods && !selectedCall;
  const checking = symbol && !saved && (!checked || checked.loading);
  const availableYears = [...new Set((checked?.periods || []).map((item) => item.year))];

  useEffect(() => {
    setCoverage(null);
    if (loading || chooseCompany || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setCoverage({ticker:symbol, loading:true});
      apiRequest(`/transcripts/${encodeURIComponent(symbol)}/periods`, {timeoutMs:15000}).then((data) => {
        if (!cancelled) setCoverage(data);
      }).catch(() => { if (!cancelled) setCoverage({ticker:symbol, error:true}); });
    }, 650);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [symbol, loading, chooseCompany]);

  useEffect(() => {
    if (period) { setTicker(period.ticker); setYear(period.year); setQuarter(period.quarter); }
  }, [period?.ticker, period?.year, period?.quarter]);

  useEffect(() => {
    if (loading || !ticker.trim() || document.activeElement?.id !== "ticker") {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    let cancelled = false;
    setSuggestions([]);
    setShowSuggestions(false);
    const query = encodeURIComponent(ticker.trim());
    const timeout = setTimeout(async () => {
    try {
        const data = await apiRequest(`/transcripts/search?q=${query}`, {timeoutMs:15000});
        if (cancelled) return;
        setLookup({query:symbol, companies:data.companies});
        setSuggestions(data.companies);
        setShowSuggestions(document.activeElement?.id === "ticker");
    } catch {
        if (!cancelled) setSuggestions([]);
    }
    }, 200);

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [ticker, loading]);

  function handleSelect(item) {
    setTicker(item.symbol);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!ticker.trim() || unavailable || checking || chooseCompany) return;
    setShowSuggestions(false);
    onSubmit({ ticker: ticker.trim(), year: Number(year), quarter: Number(quarter) });
  }

  return (
    <><form className="search-bar" onSubmit={handleSubmit} onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setShowSuggestions(false);
    }}>
      <div className="search-fields">
        <div className="search-field ticker-field" style={{ position: "relative" }}>
          <label htmlFor="ticker">Company or ticker</label>
          <input
            id="ticker"
            type="text"
            placeholder="e.g. AAPL"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Escape") setShowSuggestions(false); }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            pattern="[A-Za-z][A-Za-z0-9.\-]*"
            disabled={loading}
            required
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="suggestions">
              <p className="suggestion-source">Companies with transcripts · select a fiscal period</p>
              {suggestions.map((item) => (
                <button
                  type="button"
                  key={item.symbol}
                  className="suggestion-item"
                  onClick={() => handleSelect(item)}
                >
                  <span className="suggestion-ticker">{item.symbol}</span>
                  <span className="suggestion-name">{item.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="search-field">
          <label htmlFor="year">Fiscal year</label>
          {availableYears.length ? <select id="year" value={year} disabled={loading} onChange={(e) => setYear(e.target.value)}>
            {!availableYears.includes(Number(year)) && <option value={year}>{year} — unavailable</option>}
            {availableYears.map((value) => <option key={value} value={value}>{value}</option>)}
          </select> : <input
            id="year"
            type="number"
            min="2000"
            max="2100"
            value={year}
            disabled={loading}
            onChange={(e) => setYear(e.target.value)}
            required
          />}
        </div>
        <div className="search-field">
          <label htmlFor="quarter">Quarter</label>
          <select id="quarter" disabled={loading} value={quarter} onChange={(e) => setQuarter(e.target.value)}>
            {[1,2,3,4].map((value) => <option key={value} value={value} disabled={checked?.periods?.length && !checked.periods.some((item) => item.year === Number(year) && item.quarter === value)}>Q{value}</option>)}
          </select>
        </div>
      </div>
      <button className="analyze-btn" disabled={loading || unavailable || checking || chooseCompany}>
        {loading ? (
          <span className="btn-inner">
            <span className="spinner" /> {loading === "saved" ? "Opening report" : "Analyzing"}
          </span>
        ) : (
          <span className="btn-inner">{chooseCompany ? "Select company" : checking ? "Checking calls…" : unavailable ? "No transcript" : saved ? "Open report" : "Analyze call"}</span>
        )}
      </button>

    </form>
    {(symbol && (saved || checked)) && <div className={`call-coverage ${unavailable ? "coverage-missing" : ""}`} role="status" aria-live="polite">
      {saved ? <p>Existing report · Call held {callDateLabel(saved.call_date)}</p> : selectedCall ? <p>Transcript available · Call held {callDateLabel(selectedCall.call_date)}</p> : checked?.loading ? <p>Checking transcript availability…</p> : checked?.error ? <p>Coverage couldn’t be checked. You can still try this call.</p> : checked?.periods?.length ? <><p>No {symbol} Q{quarter} FY{year} transcript in our current source. Available calls:</p><div className="coverage-periods">{checked.periods.slice(0, 6).map((item) => <button type="button" key={`${item.year}-${item.quarter}`} onClick={() => {setYear(item.year); setQuarter(item.quarter);}}>Q{item.quarter} FY{item.year}</button>)}</div></> : <p>No transcripts for {symbol} in our current source. Try another company.</p>}
    </div>}</>
  );
}

function CallLibrary({ history, total, sort, onSort, loading, error, onRetry, onSelect, selectedId, onMore, query, onQuery }) {
  const [expanded, setExpanded] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!expanded) return;
    const close = (event) => { if (!wrap.current?.contains(event.target)) setExpanded(false); };
    const escape = (event) => { if (event.key === "Escape") { setExpanded(false); wrap.current?.querySelector(".library-trigger")?.focus(); } };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [expanded]);
  const matches = history;
  return <div className="call-library" ref={wrap}>
    <button type="button" className="library-trigger" aria-expanded={expanded} aria-controls="call-library-panel" onClick={() => setExpanded(!expanded)}>Call library {!loading && !error && <b>{total}</b>}<span aria-hidden="true">⌄</span></button>
    {expanded && <section id="call-library-panel" className="library-panel" aria-label="Call library"><div className="library-heading"><div><h2>Call library</h2><p>Previously analysed calls.</p></div><button type="button" aria-label="Close call library" onClick={() => setExpanded(false)}>×</button></div><label className="sr-only" htmlFor="library-query">Filter calls by company, ticker, date or period</label><input id="library-query" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Company, ticker, YYYY-MM-DD or year" />
      <label className="sr-only" htmlFor="saved-sort">Sort reports</label><select id="saved-sort" className="rail-sort" value={sort} onChange={(event) => onSort(event.target.value)}><option value="recent">Recently added</option><option value="movers">Largest 1-day move</option><option value="gains">Biggest gain</option><option value="drops">Biggest drop</option></select>
      {loading && <p className="rail-status" role="status">Loading calls…</p>}{error && <p className="rail-status">{error} <button type="button" onClick={onRetry}>Try again</button></p>}
      <div className="library-list">{matches.map((item) => <button type="button" className="library-call" aria-current={item.report_id === selectedId ? "true" : undefined} key={item.report_id} onClick={() => { onSelect(item); setExpanded(false); }}><CompanyMark ticker={item.ticker} /><strong>{item.ticker}<small>Fiscal Q{item.quarter} · {item.year}</small></strong><time dateTime={item.call_date || undefined}>{callDateLabel(item.call_date)}</time><span aria-hidden="true">→</span></button>)}</div>
      {!loading && !matches.length && <p className="rail-status">No matching calls. Try another ticker or year.</p>}{history.length < total && <button type="button" className="rail-more" disabled={loading} onClick={onMore}>More calls ↓</button>}
    </section>}
  </div>;
}

const returnLabel = (value) => value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const returnTone = (value) => value > 0 ? "gain" : value < 0 ? "loss" : "";

function MarketLanding({ history, total, sort, onSort, loading, error, onRetry, onSelect, onMore, query, onQuery }) {
  const [featured, setFeatured] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const strip = useRef(null);
  const chart = useRef(null);
  useEffect(() => {
    if (history.length >= 2) return animateStockStrip(strip.current);
  }, [history]);
  function previewCall(item) {
    setFeatured(item);
    if (window.matchMedia("(max-width:950px)").matches) chart.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth", block: "start" });
  }
  useEffect(() => {
    if (!featured && history.length) setFeatured(history.find((item) => item.has_research && item.price_points >= 22) || history.find((item) => item.price_points >= 2) || history[0]);
  }, [history, featured]);
  useEffect(() => {
    if (!featured) return;
    let cancelled = false;
    setPreview(null); setPreviewError("");
    apiRequest(`/reports/${featured.report_id}`).then((data) => { if (!cancelled) setPreview(data); }).catch(() => { if (!cancelled) setPreviewError("The preview could not be loaded. You can still try opening the report."); });
    return () => { cancelled = true; };
  }, [featured?.report_id]);
  const matches = history;
  const displayedPreview = preview?.report_id === featured?.report_id ? preview : null;
  const excerpt = displayedPreview?.research?.findings?.find((finding) => finding.citations?.[0]?.quote)?.citations[0].quote;
  if (loading && !history.length && !query) return <section className="startup-loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true"/><div><h2>Getting things ready…</h2><p>The app can take a few seconds to wake up after some time away. Hang tight — your reports will appear here automatically.</p></div></section>;
  return <div className="landing-workstation">
    <section className="earnings-strip" aria-label="Choose a call to preview its price history">
      <div className="earnings-strip-label"><strong>1-day returns</strong><span>From call-day close</span></div>
      <div className="earnings-strip-calls" ref={strip} role="group" aria-label="Preview a call">
        {history.map((item) => <button type="button" key={item.report_id} aria-pressed={featured?.report_id === item.report_id} aria-label={`Preview ${item.ticker}, ${callDateLabel(item.call_date)}, Q${item.quarter} FY${item.year}`} onClick={() => previewCall(item)}>
          <span className="strip-symbol">{item.ticker}<b className={returnTone(item.return_1day)}>{returnLabel(item.return_1day)}</b></span>
          <span className="strip-date">{callDateLabel(item.call_date)}<span>Q{item.quarter} FY{item.year}</span></span>
        </button>)}
        {!history.length && <p className="landing-status">{loading ? "Loading call returns…" : "Call returns appear when reports are available."}</p>}
      </div>
    </section>
    <div className="landing-board">
    <section className="landing-reports" aria-labelledby="landing-reports-title">
      <div className="landing-section-heading"><h2 id="landing-reports-title">Reports {!loading && !error && <span>{total}</span>}</h2><div className="landing-sort" role="group" aria-label="Sort reports"><button type="button" aria-pressed={sort === "recent"} onClick={() => onSort("recent")}>Recently added</button><button type="button" aria-pressed={sort === "movers"} onClick={() => onSort("movers")}>Largest 1-day move</button></div></div>
      <label className="sr-only" htmlFor="landing-filter">Filter reports by company, date or fiscal period</label><input id="landing-filter" className="landing-filter" placeholder="Company, ticker, YYYY-MM-DD or quarter" value={query} onChange={(event) => onQuery(event.target.value)} />
      {loading && <p className="landing-status" role="status">Loading reports…</p>}
      {error && <p className="landing-status" role="alert">{error} <button type="button" onClick={onRetry}>Retry</button></p>}
      <div className="landing-table-scroll"><table className="landing-table"><caption className="sr-only">Historical call reports. Returns are measured from the call-day close. Select a row to open its report.</caption><thead><tr><th scope="col">Company / period</th><th scope="col">Call date</th><th scope="col">1 day</th><th scope="col">5 days</th></tr></thead><tbody>{matches.map((item) => <tr key={item.report_id} data-preview={featured?.report_id === item.report_id || undefined} onClick={() => onSelect(item)}><th scope="row"><button type="button" className="landing-company" aria-label={`Open ${item.ticker} report, ${callDateLabel(item.call_date)}, Q${item.quarter} FY${item.year}`}><CompanyMark ticker={item.ticker}/><span><strong>{item.ticker}</strong><small>{item.company_name && item.company_name !== item.ticker ? `${item.company_name} · ` : ""}Q{item.quarter} FY{item.year}</small></span></button></th><td><time dateTime={item.call_date || undefined}>{callDateLabel(item.call_date)}</time></td><td><span className={`move-number ${returnTone(item.return_1day)}`}>{returnLabel(item.return_1day)}</span></td><td><span className={`move-number ${returnTone(item.return_5day)}`}>{returnLabel(item.return_5day)}</span></td></tr>)}</tbody></table></div>
      {!loading && !error && !matches.length && <p className="landing-status">No matching reports. Search a company and fiscal period above to analyse a call.</p>}
      <footer className="landing-list-footer"><p>Returns from the call-day close.<br/>Historical data, not live quotes.</p>{history.length < total && <button type="button" onClick={onMore} disabled={loading}>More reports</button>}</footer>
    </section>
    <section className="landing-preview" ref={chart} aria-label="Existing call preview">
      {featured ? <>
        <header className="landing-chart-heading"><div className="landing-preview-company"><CompanyMark ticker={featured.ticker}/><div><h2>{COMPANIES[featured.ticker] || featured.company_name || featured.ticker}<span>{featured.ticker}</span></h2><p>Q{featured.quarter} FY{featured.year} · Call held <time dateTime={featured.call_date || undefined}>{callDateLabel(featured.call_date)}</time></p></div></div><button type="button" className="landing-open" onClick={() => onSelect(featured)}>Open report <span aria-hidden="true">↗</span></button></header>
        {displayedPreview ? <MarketPanel key={featured.report_id} result={displayedPreview} compact/> : <p className="landing-status chart-loading" role={previewError ? "alert" : "status"}>{previewError || "Loading price history…"}</p>}
        {excerpt && <div className="landing-transcript"><span>From the transcript</span><blockquote>“{excerpt}”</blockquote></div>}
      </> : <p className="landing-status chart-loading">Choose a call to view its price history and transcript.</p>}
    </section>
    </div>
  </div>;
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [requestedPeriod, setRequestedPeriod] = useState(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(null);
  const [previewSource, setPreviewSource] = useState(null);
  const [history, setHistory] = useState([]);
  const [sort, setSort] = useState("recent");
  const [offset, setOffset] = useState(0);
  const [historyQuery, setHistoryQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [shareStatus, setShareStatus] = useState("");
  const [reportView, setReportView] = useState("overview");
  const [source, setSource] = useState(undefined);
  const [playback, setPlayback] = useState(null);
  const reportHeading = useRef(null);
  const requestNumber = useRef(0);
  const displayedReport = useRef(null);
  const callDate = result?.call_date || result?.research?.call_date || result?.daily_prices?.[0]?.date;
  const isHome = !result && !loading && !pending;

  useEffect(() => { setReportView("overview"); setSource(undefined); }, [result?.report_id]);
  useEffect(() => { if (reportView !== "overview") setPlayback(null); }, [reportView]);
  useEffect(() => {
    document.title = result ? `${result.ticker} Q${result.quarter} ${result.year} · Earnings Call Analyzer` : "Earnings Call Analyzer";
    setShareStatus("");
    if (result) reportHeading.current?.focus({ preventScroll: true });
  }, [result]);
  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  function setReportLocation(id, push = true) {
    displayedReport.current = id ? Number(id) : null;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("report", String(id));
    else url.searchParams.delete("report");
    url.hash = "";
    if (url.toString() !== window.location.href) window.history[push ? "pushState" : "replaceState"]({}, "", url);
  }
  function goHome(push = true) {
    requestNumber.current += 1;
    setResult(null); setPending(null); setPreviewSource(null); setError(""); setLoading(false); setPlayback(null);
    setReportLocation(null, push);
  }
  async function loadReport(path, push = true, period = null) {
    const current = ++requestNumber.current;
    setRequestedPeriod(period);
    setError(""); setResult(null); setPending(null); setPreviewSource(null); setPlayback(null); setLoading("saved");
    try {
      const data = await apiRequest(path, { timeoutMs: 90000 });
      if (current !== requestNumber.current) return;
      setResult(data); setReportLocation(data.report_id, push);
    } catch (err) { if (current === requestNumber.current) setError(err.message); }
    finally { if (current === requestNumber.current) setLoading(false); }
  }
  function openSaved(item) { loadReport(`/reports/${item.report_id}`, true, item); }
  useEffect(() => {
    function navigate() {
      const id = reportIdFromSearch(window.location.search);
      if (id && id === displayedReport.current) return;
      if (id) { loadReport(`/reports/${id}`, false); }
      else {
        const invalid = new URLSearchParams(window.location.search).has("report");
        goHome(false);
        if (invalid) setError("This saved-report link is invalid.");
      }
    }
    navigate();
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    const timer = setTimeout(() => apiRequest(`/history?sort=${sort}&limit=20&offset=${offset}&q=${encodeURIComponent(historyQuery)}`, { timeoutMs: 90000 }).then((data) => {
      if (cancelled) return;
      setHistory((current) => offset ? [...current, ...(data.history || [])] : data.history || []); setTotal(data.total || 0); setHistoryError(""); setHistoryLoading(false);
    }).catch(() => { if (!cancelled) { setHistoryError("The call library is unavailable. Try again shortly."); setHistoryLoading(false); } }), historyQuery ? 250 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sort, offset, historyQuery, refreshKey]);
  async function handleSubmit({ ticker, year, quarter }) {
    const saved = history.find((item) => item.ticker === ticker.toUpperCase() && item.year === year && Number(item.quarter) === quarter);
    if (saved?.has_research) { openSaved(saved); return; }
    const current = ++requestNumber.current;
    const previous = result?.ticker === ticker && result.year === year && result.quarter === quarter ? result : null;
    setRequestedPeriod({ ticker, year, quarter });
    setError(""); setResult(null); setPending(null); setPreviewSource(null); setPlayback(null); setLoading("analysis");
    try {
      const data = await streamAnalysis({ticker, year, quarter}, (event) => {
        if (current !== requestNumber.current) return;
        if (event.type === "call") setPending({call:event, findings:[], prices:null});
        if (event.type === "finding") setPending((value) => value ? {...value, findings:[...value.findings, event.finding]} : value);
        if (event.type === "prices") setPending((value) => value ? {...value, prices:event} : value);
      });
      setOffset(0); setRefreshKey((value) => value + 1);
      if (current !== requestNumber.current) return;
      setResult(data); setPending(null); setReportLocation(data.report_id);
    } catch (err) {
      if (current === requestNumber.current) { setError(err.message || "Something went wrong."); setResult(previous); setPending((value) => value ? {...value, findings:[], failed:true} : null); }
    } finally { if (current === requestNumber.current) setLoading(false); }
  }
  async function shareReport() {
    try { await navigator.clipboard.writeText(reportUrl(window.location.href, result.report_id)); setShareStatus("Link copied"); }
    catch { setShareStatus("manual"); }
  }

  return <div className={`app research-desk ${isHome ? "market-home" : ""}`}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="app-header"><div className="header-inner"><a className="brand" href="?" onClick={(event) => { event.preventDefault(); goHome(); }}><span className="brand-name"><strong>Earnings Call</strong> <em>Analyzer</em></span></a><nav className="header-nav" aria-label="Main navigation"><button type="button" aria-current={isHome ? "page" : undefined} onClick={() => goHome()}>{isHome ? "Reports" : <><span aria-hidden="true">←</span> Back to home</>}</button><a className="source-link" href="https://github.com/MeherzadA/AI-Earnings-Call-Analyzer" target="_blank" rel="noreferrer"><svg className="github-mark" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>GitHub ↗</a></nav></div></header>
    <main className="main" id="main">
      {isHome && <h1 className="sr-only">Earnings Call Analyzer</h1>}
      <div className="desk-controls" hidden={Boolean(loading)}><section className="search-section" aria-label="Find an earnings call"><details className="report-search" open={isHome} key={isHome ? "home" : "report"}><summary hidden={isHome}>Analyze another call</summary>{isHome && <p className="landing-instructions">Search for a company, pick a fiscal year and quarter, then click Analyze call. Or start with one of the reports below.</p>}<SearchBar onSubmit={handleSubmit} loading={loading} period={result || requestedPeriod} reports={result ? [result, ...history] : history} /><p className="period-help">{isHome ? "Fiscal years can differ from calendar years." : "Use the company’s fiscal year, which can differ from the call’s calendar year."}</p></details></section>{result && <CallLibrary history={history} total={total} sort={sort} onSort={(value) => { setSort(value); setOffset(0); }} loading={historyLoading} error={historyError} onRetry={() => setRefreshKey((value) => value + 1)} onSelect={openSaved} selectedId={result.report_id} onMore={() => setOffset(history.length)} query={historyQuery} onQuery={(value) => { setHistoryQuery(value); setOffset(0); }} />}</div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className={`desk-grid view-${reportView} ${result ? "report-open" : "no-report"}`}>
        <section className="report-center" aria-label="Earnings call report" aria-busy={Boolean(loading) && !pending}>
          {loading && !pending && <div className="loading-state report-loading" role="status" aria-live="polite">
            {requestedPeriod && <div className="loading-call"><CompanyMark ticker={requestedPeriod.ticker} /><div><h1>{COMPANIES[requestedPeriod.ticker] || requestedPeriod.ticker}</h1><p>{requestedPeriod.ticker} · Q{requestedPeriod.quarter} FY{requestedPeriod.year}</p></div></div>}
            <div className="loading-bar"><div className="loading-fill" /></div>
            <p className="loading-text">{loading === "saved" ? "Opening report…" : "Fetching the call transcript…"}<span>{loading === "saved" ? "The app may need a few seconds to wake up after some time away. Your saved report will open automatically." : "You can read the transcript as soon as it arrives."}</span></p>
            <div className="loading-actions"><span className="elapsed" aria-hidden="true">{elapsed}s elapsed</span><button type="button" className="text-btn" onClick={() => goHome()}>Browse reports</button></div>
          </div>}
          {pending && <div className="results pending-report">
            <div className="report-heading"><div className="company-heading"><CompanyMark ticker={pending.call.ticker} /><div><div className="company-title-line"><h1>{COMPANIES[pending.call.ticker] || pending.call.ticker}</h1><span className="report-period">Fiscal Q{pending.call.quarter} · {pending.call.year}</span></div><p className="company-call-date">Call held <time>{callDateLabel(pending.call.call_date)}</time></p></div></div><button type="button" className="outline-btn" onClick={() => setPreviewSource({data:pending.call})}>Full transcript</button></div>
            <div className="analysis-live-status" role="status"><span className={loading ? "spinner" : ""} aria-hidden="true"/><p>{pending.failed ? "The analysis could not finish. Your transcript is available." : pending.findings.length ? "Findings are arriving. Completing the remaining research…" : "Transcript ready. Analysing the call…"}</p><button type="button" className="text-btn" onClick={() => pending.failed ? handleSubmit(requestedPeriod) : goHome()}>{pending.failed ? "Try again" : "Browse reports"}</button></div>
            {!pending.failed && <section aria-label="Findings as they arrive"><h2 className="stream-findings-heading">Findings{pending.findings.length ? ` · ${pending.findings.length}` : ""}</h2>{pending.findings.length ? <><p className="section-description">AI-generated findings. Each excerpt and its numbers are checked before display; the report is still being completed.</p><div className="findings-grid">{pending.findings.map((finding, index) => <FindingCard key={index} finding={finding} onSource={(citation) => setPreviewSource({data:pending.call, citation})} />)}</div></> : <p className="section-description">Findings will appear here after their transcript excerpts pass source checks. You can read the full transcript now.</p>}</section>}
            {pending.prices?.daily_prices?.length > 0 && <div className="pending-prices"><MarketPanel result={{...pending.call, ...pending.prices}} compact /></div>}
          </div>}
          {isHome && <MarketLanding history={history} total={total} sort={sort} onSort={(value) => { setSort(value); setOffset(0); }} loading={historyLoading} error={historyError} onRetry={() => setRefreshKey((value) => value + 1)} onSelect={openSaved} onMore={() => setOffset(history.length)} query={historyQuery} onQuery={(value) => { setHistoryQuery(value); setOffset(0); }} />}
          {result && <div className="results">
            <div className="report-heading"><div className="company-heading"><CompanyMark ticker={result.ticker} /><div><div className="company-title-line"><h1 ref={reportHeading} tabIndex={-1}>{COMPANIES[result.ticker] || result.company_name || result.ticker}</h1><span className="report-period">Fiscal Q{result.quarter} · {result.year}</span></div><p className="company-call-date">{result.ticker} · Call held <time dateTime={callDate || undefined}>{callDateLabel(callDate)}</time></p></div></div><button type="button" className="share-report" onClick={shareReport}>{shareStatus && shareStatus !== "manual" ? shareStatus : "Copy link"}</button></div>
            {callDate && Number(callDate.slice(0, 4)) !== result.year && <p className="fiscal-note">This call took place in {callDate.slice(0, 4)} and reports the company’s <strong>fiscal Q{result.quarter} {result.year}</strong>. Fiscal years do not always match calendar years.</p>}
            {shareStatus === "manual" && <p className="share-fallback">Copy this link: <a href={reportUrl(window.location.href, result.report_id)}>{reportUrl(window.location.href, result.report_id)}</a></p>}
            <nav className="workspace-tabs product-tabs" role="tablist" aria-label="Report views" onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              const tabs = Array.from(event.currentTarget.querySelectorAll('[role="tab"]'));
              const index = tabs.indexOf(event.target);
              if (index < 0) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
              tabs[next].focus(); tabs[next].click();
            }}>{[["overview", "Overview"], ["findings", "Findings"], ["concerns", "Concerns"], ["market", "Share price"], ["research", "Forecasts & news"]].map(([id, label]) => <button type="button" role="tab" key={id} id={`tab-${id}`} data-view={id} aria-selected={reportView === id} aria-controls="report-panel" tabIndex={reportView === id ? 0 : -1} onClick={() => setReportView(id)}>{label}</button>)}</nav>
            <div id="report-panel" role="tabpanel" aria-labelledby={`tab-${reportView}`} tabIndex={0} className="report-workspace">
              <div className="report-content">
              {reportView === "overview" && <p className="report-provenance">AI-generated{result.research?.generated_at && <> · Generated <time dateTime={result.research.generated_at}>{callDateLabel(result.research.generated_at)}</time></>} · {result.research?.checks?.human_review === "not_reviewed" ? "Not reviewed by a person" : "Human review not confirmed"}. Excerpt and number checks are automated.</p>}
              {reportView === "overview" && result.research?.financial_highlights.length > 0 && <section className="financial-highlights" aria-label="Company-reported financial highlights">{result.research.financial_highlights.slice(0, 3).map((metric) => <button type="button" className="financial-highlight" key={metric.id} onClick={() => setSource(metric.citations[0])} aria-label={`${metric.label}: ${metric.value}. Inspect source`}><span>{metric.label}</span><small className="highlight-period">{result.highlight_periods?.[metric.id] === "annual" ? "Full fiscal year" : result.highlight_periods?.[metric.id] === "quarter" ? `Q${result.quarter} FY${result.year}` : "Period not confirmed"}</small><strong className="financial-value">{metric.value}</strong></button>)}</section>}
              {reportView === "market" ? <MarketPanel result={result} /> : <div className="brief-pane"><ResearchReport key={result.report_id} result={result} view={reportView} onSource={setSource} onPlayback={setPlayback} /></div>}
              </div>
              {reportView !== "market" && <aside className="price-rail" aria-label="Historical stock reaction"><MarketPanel result={result} compact onExplore={() => setReportView("market")} /></aside>}
            </div>
          </div>}
        </section>
      </div>
      {result && source !== undefined && <SourceViewer key={result.report_id} reportId={result.report_id} citation={source} expectedHash={result.research?.source_hash} playback={playback} onClose={() => setSource(undefined)} />}
      {previewSource && <SourceViewer initialData={previewSource.data} citation={previewSource.citation} expectedHash={previewSource.data.source_hash} onClose={() => {setPreviewSource(null); if (result) reportHeading.current?.focus({preventScroll:true});}} />}
    </main>
    <footer className="app-footer"><span>Transcripts: <a href="https://huggingface.co/datasets/defeatbeta/yahoo-finance-data" target="_blank" rel="noreferrer">defeatbeta</a> · Analysis: Gemini · Prices: Yahoo Finance</span><a href="https://meherzad.tech" target="_blank" rel="noreferrer">Built by Meherzad Antia ↗</a></footer>
  </div>;
}
