import { useState, useMemo, useEffect, useRef } from "react";
import MarketPanel from "./MarketPanel.jsx";
import { apiRequest } from "./api.js";
import ResearchReport, { SourceViewer } from "./ResearchReport.jsx";
import { reportIdFromSearch, reportUrl } from "./reportNavigation.js";
import { callDateLabel } from "./reportPresentation.js";

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

function SearchBar({ onSubmit, loading, period }) {
  const today = useMemo(() => new Date(), []);
  const completedPeriod = useMemo(() => new Date(today.getFullYear(), today.getMonth() - 3, 1), [today]);
  const [ticker, setTicker] = useState("");
  const [year, setYear] = useState(completedPeriod.getFullYear());
  const [quarter, setQuarter] = useState(currentQuarter(completedPeriod));
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (period) { setTicker(period.ticker); setYear(period.year); setQuarter(period.quarter); }
  }, [period?.ticker, period?.year, period?.quarter]);

  useEffect(() => {
    if (loading || ticker.length < 1 || document.activeElement?.id !== "ticker" || !import.meta.env.VITE_FMP_API_KEY) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const controller = new AbortController();
    setSuggestions([]);
    setShowSuggestions(false);
    const query = encodeURIComponent(ticker.trim());
    const timeout = setTimeout(async () => {
    try {
        const [symbolRes, nameRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/stable/search-symbol?query=${query}&apikey=${import.meta.env.VITE_FMP_API_KEY}`, { signal: controller.signal }),
        fetch(`https://financialmodelingprep.com/stable/search-name?query=${query}&apikey=${import.meta.env.VITE_FMP_API_KEY}`, { signal: controller.signal })
        ]);

        const [symbolData, nameData] = await Promise.all([
        symbolRes.json(),
        nameRes.json()
        ]);

        const combined = [...(Array.isArray(symbolData) ? symbolData : []), ...(Array.isArray(nameData) ? nameData : [])];

        // Deduplicate by symbol
        const seen = new Set();
        const deduped = combined.filter((item) => {
        if (seen.has(item.symbol)) return false;
        seen.add(item.symbol);
        return true;
        });

        const filtered = deduped.filter((item) =>
        (item.exchange === "NASDAQ" || item.exchange === "NYSE") &&
        /^[A-Z]{1,5}$/.test(item.symbol)
        );

        if (controller.signal.aborted) return;
        setSuggestions(filtered.slice(0, 5));
        setShowSuggestions(document.activeElement?.id === "ticker");
    } catch {
        if (!controller.signal.aborted) setSuggestions([]);
    }
    }, 300);

    return () => { clearTimeout(timeout); controller.abort(); };
  }, [ticker, loading]);

  function handleSelect(item) {
    setTicker(item.symbol);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!ticker.trim()) return;
    setShowSuggestions(false);
    onSubmit({ ticker: ticker.trim(), year: Number(year), quarter: Number(quarter) });
  }

  return (
    <form className="search-bar" onSubmit={handleSubmit} onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setShowSuggestions(false);
    }}>
      <div className="search-fields">
        <div className="search-field ticker-field" style={{ position: "relative" }}>
          <label htmlFor="ticker">Company ticker</label>
          <input
            id="ticker"
            type="text"
            placeholder="e.g. AAPL"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Escape") setShowSuggestions(false); }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            maxLength={10}
            autoComplete="off"
            spellCheck={false}
            pattern="[A-Za-z][A-Za-z0-9.\-]*"
            disabled={loading}
            required
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="suggestions">
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
          <input
            id="year"
            type="number"
            min="2000"
            max="2100"
            value={year}
            disabled={loading}
            onChange={(e) => setYear(e.target.value)}
            required
          />
        </div>
        <div className="search-field">
          <label htmlFor="quarter">Quarter</label>
          <select id="quarter" disabled={loading} value={quarter} onChange={(e) => setQuarter(e.target.value)}>
            <option value="1">Q1</option>
            <option value="2">Q2</option>
            <option value="3">Q3</option>
            <option value="4">Q4</option>
          </select>
        </div>
      </div>
      <button className="analyze-btn" disabled={loading}>
        {loading ? (
          <span className="btn-inner">
            <span className="spinner" /> {loading === "saved" ? "Opening report" : "Analyzing"}
          </span>
        ) : (
          <span className="btn-inner">Analyze call</span>
        )}
      </button>

    </form>
  );
}

function CallLibrary({ history, total, sort, onSort, loading, error, onRetry, onSelect, selectedId, onMore }) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const wrap = useRef(null);
  useEffect(() => {
    if (!expanded) return;
    const close = (event) => { if (!wrap.current?.contains(event.target)) setExpanded(false); };
    const escape = (event) => { if (event.key === "Escape") { setExpanded(false); wrap.current?.querySelector(".library-trigger")?.focus(); } };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [expanded]);
  const matches = history.filter((item) => `${item.ticker} ${item.year} Q${item.quarter} ${callDateLabel(item.call_date)}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="call-library" ref={wrap}>
    <button type="button" className="library-trigger" aria-expanded={expanded} aria-controls="call-library-panel" onClick={() => setExpanded(!expanded)}>Call library {!loading && !error && <b>{total}</b>}<span aria-hidden="true">⌄</span></button>
    {expanded && <section id="call-library-panel" className="library-panel" aria-label="Call library"><div className="library-heading"><div><h2>Call library</h2><p>Previously analysed calls.</p></div><button type="button" aria-label="Close call library" onClick={() => setExpanded(false)}>×</button></div><label className="sr-only" htmlFor="library-query">Filter calls by ticker, date or period</label><input id="library-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by ticker, date or year" />
      <label className="sr-only" htmlFor="saved-sort">Sort reports</label><select id="saved-sort" className="rail-sort" value={sort} onChange={(event) => onSort(event.target.value)}><option value="recent">Recently added</option><option value="movers">Largest 1-day move</option><option value="gains">Biggest gain</option><option value="drops">Biggest drop</option></select>
      {loading && <p className="rail-status" role="status">Loading calls…</p>}{error && <p className="rail-status">{error} <button type="button" onClick={onRetry}>Try again</button></p>}
      <div className="library-list">{matches.map((item) => <button type="button" className="library-call" aria-current={item.report_id === selectedId ? "true" : undefined} key={item.report_id} onClick={() => { onSelect(item); setExpanded(false); }}><CompanyMark ticker={item.ticker} /><strong>{item.ticker}<small>Fiscal Q{item.quarter} · {item.year}</small></strong><time dateTime={item.call_date || undefined}>{callDateLabel(item.call_date)}</time><span aria-hidden="true">→</span></button>)}</div>
      {!loading && !matches.length && <p className="rail-status">No matching calls. Try another ticker or year.</p>}{history.length < total && <button type="button" className="rail-more" disabled={loading} onClick={onMore}>More calls ↓</button>}
    </section>}
  </div>;
}

const returnLabel = (value) => value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const returnTone = (value) => value > 0 ? "gain" : value < 0 ? "loss" : "";

function MarketLanding({ history, total, sort, onSort, loading, error, onRetry, onSelect, onMore }) {
  const [query, setQuery] = useState("");
  const [featured, setFeatured] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  useEffect(() => {
    if (!featured && history.length) setFeatured(history[Math.floor(Math.random() * history.length)]);
  }, [history, featured]);
  useEffect(() => {
    if (!featured) return;
    let cancelled = false;
    apiRequest(`/reports/${featured.report_id}`).then((data) => { if (!cancelled) setPreview(data); }).catch(() => { if (!cancelled) setPreviewError("The preview could not be loaded. You can still try opening the report."); });
    return () => { cancelled = true; };
  }, [featured?.report_id]);
  const matches = history.filter((item) => `${item.ticker} ${COMPANIES[item.ticker] || ""} ${item.year} Q${item.quarter} ${callDateLabel(item.call_date)}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="landing-board">
    <section className="landing-reports" aria-labelledby="landing-reports-title">
      <div className="landing-section-heading"><h2 id="landing-reports-title">Reports {!loading && !error && <span>{total}</span>}</h2><div className="landing-sort" role="group" aria-label="Sort reports"><button type="button" aria-pressed={sort === "recent"} onClick={() => onSort("recent")}>Recently added</button><button type="button" aria-pressed={sort === "movers"} onClick={() => onSort("movers")}>Largest 1-day move</button></div></div>
      <label className="sr-only" htmlFor="landing-filter">Filter reports by company, date or fiscal period</label><input id="landing-filter" className="landing-filter" placeholder="Filter by company, date or fiscal year" value={query} onChange={(event) => setQuery(event.target.value)} />
      {loading && <p className="landing-status" role="status">Loading reports…</p>}
      {error && <p className="landing-status" role="alert">{error} <button type="button" onClick={onRetry}>Retry</button></p>}
      <div className="landing-table-scroll"><table className="landing-table"><caption className="sr-only">Historical call reports. Returns are measured from the call-day close. Select a row to open its report.</caption><thead><tr><th>Company</th><th>Call date</th><th>Fiscal period</th><th>1 day</th><th>5 days</th></tr></thead><tbody>{matches.map((item) => <tr key={item.report_id} onClick={() => onSelect(item)}><th scope="row"><button type="button" className="landing-company" aria-label={`Open ${item.ticker} report, ${callDateLabel(item.call_date)}, Q${item.quarter} FY${item.year}`}><CompanyMark ticker={item.ticker}/><span><strong>{item.ticker}</strong><small>{COMPANIES[item.ticker] || item.ticker}</small><span className="landing-mobile-period">Q{item.quarter} FY{item.year}</span></span></button></th><td><time dateTime={item.call_date || undefined}>{callDateLabel(item.call_date)}</time></td><td>Q{item.quarter} <span>FY{item.year}</span></td><td className={returnTone(item.return_1day)}>{returnLabel(item.return_1day)}</td><td className={returnTone(item.return_5day)}>{returnLabel(item.return_5day)}</td></tr>)}</tbody></table></div>
      {!loading && !error && !matches.length && <p className="landing-status">No matching reports. Search a company and fiscal period above to analyse a call.</p>}
      <footer className="landing-list-footer"><p>Historical returns from the call-day close. These are not live quotes.</p>{history.length < total && <button type="button" onClick={onMore} disabled={loading}>More reports</button>}</footer>
    </section>
    <aside className="landing-preview" aria-label="Existing call preview">
      <div className="landing-section-heading"><h2>Call preview</h2>{featured && <button type="button" className="landing-open" onClick={() => onSelect(featured)}>Open report</button>}</div>
      {featured ? <><div className="landing-preview-company"><CompanyMark ticker={featured.ticker}/><div><h3>{COMPANIES[featured.ticker] || featured.ticker}</h3><p>{featured.ticker} · Q{featured.quarter} FY{featured.year}</p></div></div><time className="landing-preview-date" dateTime={featured.call_date || undefined}>{callDateLabel(featured.call_date)}</time>{preview ? <MarketPanel result={preview} compact/> : <p className="landing-status" role={previewError ? "alert" : "status"}>{previewError || "Loading the call’s price history…"}</p>}</> : <p className="landing-status">A report and its price history will appear here when the library loads.</p>}
    </aside>
  </div>;
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [requestedPeriod, setRequestedPeriod] = useState(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [sort, setSort] = useState("recent");
  const [limit, setLimit] = useState(20);
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
  const isHome = !result && !loading;

  useEffect(() => { setReportView("overview"); setSource(undefined); }, [result?.report_id]);
  useEffect(() => { if (reportView !== "overview") setPlayback(null); }, [reportView]);
  useEffect(() => {
    document.title = result ? `${result.ticker} Q${result.quarter} ${result.year} · Earnings Analyzer` : "Earnings Analyzer";
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
    setResult(null); setError(""); setLoading(false); setPlayback(null);
    setReportLocation(null, push);
  }
  async function loadReport(path, push = true, period = null) {
    const current = ++requestNumber.current;
    setRequestedPeriod(period);
    setError(""); setResult(null); setPlayback(null); setLoading("saved");
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
    apiRequest(`/history?sort=${sort}&limit=${limit}`, { timeoutMs: 90000 }).then((data) => {
      if (cancelled) return;
      setHistory(data.history || []); setTotal(data.total || 0); setHistoryError(""); setHistoryLoading(false);
    }).catch(() => { if (!cancelled) { setHistoryError("The call library is unavailable. Try again shortly."); setHistoryLoading(false); } });
    return () => { cancelled = true; };
  }, [sort, limit, refreshKey]);
  async function handleSubmit({ ticker, year, quarter }) {
    const saved = history.find((item) => item.ticker === ticker.toUpperCase() && item.year === year && Number(item.quarter) === quarter);
    if (saved?.has_research) { openSaved(saved); return; }
    const current = ++requestNumber.current;
    const previous = result?.ticker === ticker && result.year === year && result.quarter === quarter ? result : null;
    setRequestedPeriod({ ticker, year, quarter });
    setError(""); setResult(null); setPlayback(null); setLoading("analysis");
    try {
      const data = await apiRequest("/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker, year, quarter, with_research: true }) });
      if (current !== requestNumber.current) return;
      setResult(data); setReportLocation(data.report_id); setRefreshKey((value) => value + 1);
    } catch (err) {
      if (current === requestNumber.current) { setError(err.message || "Something went wrong."); setResult(previous); }
    } finally { if (current === requestNumber.current) setLoading(false); }
  }
  async function shareReport() {
    try { await navigator.clipboard.writeText(reportUrl(window.location.href, result.report_id)); setShareStatus("Link copied"); }
    catch { setShareStatus("manual"); }
  }

  return <div className={`app research-desk ${isHome ? "market-home" : ""}`}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="app-header"><div className="header-inner"><a className="brand" href="?" onClick={(event) => { event.preventDefault(); goHome(); }}><span className="brand-name"><strong>Earnings</strong> Analyzer</span></a><nav className="header-nav" aria-label="Main navigation"><button type="button" onClick={() => goHome()}>Reports</button><a href="/review.html">How it works</a><a className="source-link" href="https://github.com/MeherzadA/AI-Earnings-Call-Analyzer" target="_blank" rel="noreferrer">GitHub ↗</a></nav></div></header>
    <main className="main" id="main">
      {isHome && <header className="landing-heading"><div><h1>Earnings calls</h1><p>Search a fiscal period or open a report.</p></div><span>Historical reports</span></header>}
      <div className="desk-controls" hidden={Boolean(loading)}><section className="search-section" aria-label="Find an earnings call"><SearchBar onSubmit={handleSubmit} loading={loading} period={result || requestedPeriod} /><p className="period-help">Use the company’s fiscal year, which can differ from the call’s calendar year.</p></section>{result && <CallLibrary history={history} total={total} sort={sort} onSort={(value) => { setSort(value); setLimit(20); }} loading={historyLoading} error={historyError} onRetry={() => setRefreshKey((value) => value + 1)} onSelect={openSaved} selectedId={result.report_id} onMore={() => setLimit((value) => value + 20)} />}</div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className={`desk-grid view-${reportView} ${result ? "report-open" : "no-report"}`}>
        <section className="report-center" aria-label="Earnings call report" aria-busy={Boolean(loading)}>
          {loading && <div className="loading-state report-loading" role="status" aria-live="polite">
            {requestedPeriod && <div className="loading-call"><CompanyMark ticker={requestedPeriod.ticker} /><div><h1>{COMPANIES[requestedPeriod.ticker] || requestedPeriod.ticker}</h1><p>{requestedPeriod.ticker} · Q{requestedPeriod.quarter} FY{requestedPeriod.year}</p></div></div>}
            <div className="loading-bar"><div className="loading-fill" /></div>
            <p className="loading-text">{loading === "saved" ? "Opening report…" : "Loading report…"}<span>{loading === "saved" ? "Opening an existing report. No new analysis is needed." : "An existing report opens directly. A new call takes longer to analyse."}</span></p>
            <div className="loading-actions"><span className="elapsed" aria-hidden="true">{elapsed}s elapsed</span><button type="button" className="text-btn" onClick={() => goHome()}>Browse reports</button></div>
          </div>}
          {isHome && <MarketLanding history={history} total={total} sort={sort} onSort={(value) => { setSort(value); setLimit(20); }} loading={historyLoading} error={historyError} onRetry={() => setRefreshKey((value) => value + 1)} onSelect={openSaved} onMore={() => setLimit((value) => value + 20)} />}
          {result && <div className="results">
            <div className="report-heading"><div className="company-heading"><CompanyMark ticker={result.ticker} /><div><div className="company-title-line"><h1 ref={reportHeading} tabIndex={-1}>{COMPANIES[result.ticker] || result.ticker}</h1><span className="report-period">Fiscal Q{result.quarter} · {result.year}</span></div><p className="company-call-date">{result.ticker} · Call held <time dateTime={callDate || undefined}>{callDateLabel(callDate)}</time></p></div></div><button type="button" className="share-report" onClick={shareReport}>{shareStatus && shareStatus !== "manual" ? shareStatus : "Copy link"}</button></div>
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
              {reportView === "overview" && result.research?.financial_highlights.length > 0 && <section className="financial-highlights" aria-label="Company-reported financial highlights">{result.research.financial_highlights.slice(0, 3).map((metric) => <button type="button" className="financial-highlight" key={metric.id} onClick={() => setSource(metric.citations[0])} aria-label={`${metric.label}: ${metric.value}. Inspect source`}><span>{metric.label}</span><strong className="financial-value">{metric.value}</strong></button>)}</section>}
              {reportView === "market" ? <MarketPanel result={result} /> : <div className="brief-pane"><ResearchReport key={result.report_id} result={result} view={reportView} onSource={setSource} onPlayback={setPlayback} /></div>}
            </div>
          </div>}
        </section>
        {result && reportView !== "market" && <aside className="price-rail" aria-label="Historical stock reaction"><MarketPanel result={result} compact onExplore={() => setReportView("market")} /></aside>}
      </div>
      {result && source !== undefined && <SourceViewer key={result.report_id} reportId={result.report_id} citation={source} expectedHash={result.research?.source_hash} playback={playback} onClose={() => setSource(undefined)} />}
    </main>
    <footer className="app-footer"><span>Transcripts: <a href="https://huggingface.co/datasets/defeatbeta/yahoo-finance-data" target="_blank" rel="noreferrer">defeatbeta</a> · Analysis: Gemini · Prices: Yahoo Finance</span><a href="https://meherzad.tech" target="_blank" rel="noreferrer">Built by Meherzad Antia ↗</a></footer>
  </div>;
}
