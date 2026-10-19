import { useState, useMemo, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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
          <span className="btn-inner">Analyze call <span aria-hidden="true">↗</span></span>
        )}
      </button>

    </form>
  );
}

function StockPriceChart({ dailyPrices, ticker, compact = false }) {
  if (!dailyPrices || dailyPrices.length === 0) {
    return <div className="card price-empty"><p className="card-label">Market reaction</p><h3>Price data unavailable</h3><p>The transcript report is saved. Daily prices may be missing for recent calls or when the price provider is unavailable.</p></div>;
  }

  // Transform for Recharts: needs {label, price}
  const chartData = dailyPrices.map((item) => ({
    label: item.label || item.date,
    price: item.price,
    date: item.date,
  }));

  return (
    <div className="card chart-card">
      {!compact && <div className="chart-heading"><div><p className="card-label">Market reaction</p><h3 className="chart-title">{ticker} after the call</h3></div><span className="chart-source">Daily close · USD</span></div>}
      
      <ResponsiveContainer width="100%" height={compact ? 190 : 300}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
          accessibilityLayer
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e7ec" />
          <XAxis
            dataKey="label"
            tickFormatter={(value) => value === "Earnings" ? "Call" : value.replace("Day ", "D")}
            interval={0}
            tickMargin={8}
            stroke="#6b7280"
            style={{ fontSize: "12px" }}
          />
          <YAxis
            stroke="#6b7280"
            style={{ fontSize: "12px" }}
            domain={[
              (dataMin) => Math.floor(dataMin * 0.99),
              (dataMax) => Math.ceil(dataMax * 1.01)
            ]}
            tickFormatter={(value) => `$${Number(value).toFixed(Math.abs(value) < 10 ? 2 : 0)}`}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(255,255,255,0.95)",
              border: "1px solid #e4e7ec",
              borderRadius: "8px",
              padding: "8px",
            }}
            formatter={(value) => `$${value.toFixed(2)}`}
            labelFormatter={(_label, payload) => payload?.[0]?.payload?.date || ""}
            labelStyle={{ color: "#0f1117" }}
          />
          <Line
            type="linear"
            dataKey="price"
            stroke="#2457c5"
            dot={{ fill: "#2457c5", r: 3 }}
            activeDot={{ r: 7 }}
            isAnimationActive={false}
            name="Close Price"
          />
        </LineChart>
      </ResponsiveContainer>

      {!compact && <div className="chart-stats">
        <div className="stat">
          <span className="label">Call-day close</span>
          <span className="value">${chartData[0]?.price.toFixed(2)}</span>
        </div>
        <div className="stat">
          <span className="label">Day 1</span>
          <span className="value">{chartData[1] ? `$${chartData[1].price.toFixed(2)}` : "Pending"}</span>
        </div>
        <div className="stat">
          <span className="label">Day 5</span>
          <span className="value">{chartData[5] ? `$${chartData[5].price.toFixed(2)}` : "Pending"}</span>
        </div>
      </div>}
      {compact && <div className="closing-snapshot">{[[0, "Call-day close"], [1, "Day 1 close"], [5, "Day 5 close"]].map(([index, label]) => <div key={label}><span>{label}<small>{chartData[index]?.date || "Pending"}</small></span><strong>{chartData[index] ? `$${chartData[index].price.toFixed(2)}` : "—"}</strong></div>)}</div>}
      <details className="price-details"><summary>View daily prices <span>Source: Yahoo Finance</span></summary><table><caption className="sr-only">{ticker} closing prices around the earnings call</caption><thead><tr><th scope="col">Session</th><th scope="col">Date</th><th scope="col">Close (USD)</th></tr></thead><tbody>{dailyPrices.map((item) => <tr key={item.date}><th scope="row">{item.label}</th><td>{item.date}</td><td>${item.price.toFixed(2)}</td></tr>)}</tbody></table></details>
    </div>
  );
}

function ReturnMetric({ label, value }) {
  return <div className="return-metric"><span>{label}</span><strong className={value > 0 ? "gain" : value < 0 ? "loss" : ""}>{value == null ? "Unavailable" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`}</strong><small>from the call-day close</small></div>;
}

function MarketPanel({ result, compact = false }) {
  return <section className={`market-panel ${compact ? "market-panel-compact" : ""}`} aria-labelledby="market-title">
    <div className="panel-heading"><h2 id="market-title">Stock reaction</h2><span className="panel-tag">Closing prices</span></div>
    <div className="return-metrics"><ReturnMetric label="1 trading day" value={result.return_1day} /><ReturnMetric label="5 trading days" value={result.return_5day} /></div>
    <StockPriceChart dailyPrices={result.daily_prices} ticker={result.ticker} compact={compact} />
    <p className="market-window-note">Regular-session close → regular-session close. This chart does not show after-hours or intraday moves, which news headlines may describe.</p>
    <p className="market-caveat">A price move alone does not show what caused it.</p>
  </section>;
}

function SavedCalls({ history, total, sort, onSort, loading, error, onRetry, onSelect, selectedId, onMore, busy }) {
  const [expanded, setExpanded] = useState(false);
  return <aside className="saved-calls" aria-label="Saved calls">
    <div className="saved-calls-heading"><h2>Saved calls <span>{loading ? "…" : total}</span></h2><button type="button" className="rail-toggle" aria-expanded={expanded} aria-controls="saved-calls-content" onClick={() => setExpanded(!expanded)}>{expanded ? "Hide" : "Browse"}</button></div>
    <div id="saved-calls-content" className={`saved-calls-content ${expanded ? "rail-expanded" : ""}`}>
      <label className="sr-only" htmlFor="saved-sort">Sort saved calls</label><select id="saved-sort" className="rail-sort" value={sort} onChange={(event) => onSort(event.target.value)}><option value="recent">Recently saved</option><option value="movers">Largest 1-day move</option><option value="gains">Biggest 1-day gain</option><option value="drops">Biggest 1-day drop</option></select>
      {loading && <p className="rail-status" role="status">Loading saved calls…</p>}
      {error && <p className="rail-status" role="status">{error} <button type="button" onClick={onRetry}>Try again</button></p>}
      <div className="saved-call-list">{history.map((item) => <button type="button" className="saved-call" aria-current={item.report_id === selectedId ? "true" : undefined} disabled={busy} key={item.report_id} onClick={() => { onSelect(item); setExpanded(false); }}><CompanyMark ticker={item.ticker} /><span><strong>{item.ticker}</strong><time dateTime={item.call_date || undefined}>{callDateLabel(item.call_date)}</time><small>Fiscal Q{item.quarter} · {item.year}</small></span><span className="saved-call-arrow" aria-hidden="true">›</span></button>)}</div>
      {!loading && !error && !history.length && <p className="rail-status">Completed reports appear here.</p>}
      {history.length < total && <button type="button" className="rail-more" disabled={loading} onClick={onMore}>More saved calls ↓</button>}
      <p className="rail-note">Stored reports · No new AI generation</p>
    </div>
  </aside>;
}

export default function App() {
  const [loading, setLoading] = useState(false);
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
  const discoverOnce = useRef(!new URLSearchParams(window.location.search).has("report"));
  const reportHeading = useRef(null);
  const requestNumber = useRef(0);
  const displayedReport = useRef(null);
  const callDate = result?.call_date || result?.research?.call_date || result?.daily_prices?.[0]?.date;
  const featuredReports = useMemo(() => {
    const checked = history.filter((item) => item.has_research);
    return checked.length ? checked : history;
  }, [history]);

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
    discoverOnce.current = false;
    requestNumber.current += 1;
    setResult(null); setError(""); setLoading(false); setPlayback(null);
    setReportLocation(null, push);
  }
  async function loadReport(path, push = true) {
    const current = ++requestNumber.current;
    setError(""); setResult(null); setPlayback(null); setLoading("saved");
    try {
      const data = await apiRequest(path, { timeoutMs: 90000 });
      if (current !== requestNumber.current) return;
      setResult(data); setReportLocation(data.report_id, push);
    } catch (err) { if (current === requestNumber.current) setError(err.message); }
    finally { if (current === requestNumber.current) setLoading(false); }
  }
  function openSaved(item) { discoverOnce.current = false; loadReport(`/reports/${item.report_id}`); }
  useEffect(() => {
    function navigate() {
      const id = reportIdFromSearch(window.location.search);
      if (id && id === displayedReport.current) return;
      if (id) { discoverOnce.current = false; loadReport(`/reports/${id}`, false); }
      else {
        const invalid = new URLSearchParams(window.location.search).has("report");
        const discover = discoverOnce.current;
        goHome(false);
        discoverOnce.current = discover && !invalid;
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
    }).catch(() => { if (!cancelled) { setHistoryError("Saved reports aren't available right now."); setHistoryLoading(false); } });
    return () => { cancelled = true; };
  }, [sort, limit, refreshKey]);
  useEffect(() => {
    if (!discoverOnce.current || historyLoading || !featuredReports.length || result || loading || error) return;
    discoverOnce.current = false;
    if (document.querySelector(".search-bar")?.contains(document.activeElement)) return;
    const preview = featuredReports[Math.floor(Math.random() * featuredReports.length)];
    loadReport(`/reports/${preview.report_id}`, false);
  }, [historyLoading, featuredReports, result, loading, error]);

  async function handleSubmit({ ticker, year, quarter }, keepPrevious = false) {
    discoverOnce.current = false;
    const saved = history.find((item) => item.ticker === ticker.toUpperCase() && item.year === year && Number(item.quarter) === quarter);
    if (saved && !keepPrevious) { openSaved(saved); return; }
    const current = ++requestNumber.current;
    const previous = keepPrevious ? result : null;
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

  return <div className="app research-desk">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="app-header"><div className="header-inner"><a className="brand" href="?" onClick={(event) => { event.preventDefault(); goHome(); }}><span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span><span className="brand-name">Earnings Analyzer</span></a><nav className="header-nav" aria-label="Main navigation"><button type="button" onClick={() => goHome()}>Reports</button><a href="/review.html">How it works</a><a className="source-link" href="https://github.com/MeherzadA/AI-Earnings-Call-Analyzer" target="_blank" rel="noreferrer">GitHub ↗</a></nav></div></header>
    <main className="main" id="main">
      <section className="search-section" aria-label="Find an earnings call"><SearchBar onSubmit={handleSubmit} loading={loading} period={result} /><p className="period-help">Use the company’s fiscal year. It may differ from the calendar year when the call took place.</p></section>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className={`desk-grid view-${reportView} ${result ? "report-open" : "no-report"}`}>
        <SavedCalls history={history} total={total} sort={sort} onSort={(value) => { setSort(value); setLimit(20); }} loading={historyLoading} error={historyError} onRetry={() => setRefreshKey((value) => value + 1)} onSelect={openSaved} selectedId={result?.report_id} onMore={() => setLimit((value) => value + 20)} busy={Boolean(loading)} />
        <section className="report-center" aria-label="Earnings call report" aria-busy={Boolean(loading)}>
          {loading && <div className="loading-state" role="status" aria-live="polite"><div className="loading-bar"><div className="loading-fill" /></div><p className="loading-text">{loading === "saved" ? "Opening the saved report…" : "Preparing your source-based report…"}<br/><span>{loading === "saved" ? "No new AI analysis is generated. The free server may need a moment to wake up." : "Reading the transcript, generating findings, and checking source excerpts."}</span></p><span className="elapsed" aria-hidden="true">{elapsed}s elapsed</span><button type="button" className="text-btn" onClick={() => goHome()}>Back to saved calls</button></div>}
          {!result && !loading && <div className="workspace-welcome"><p className="eyebrow">Earnings call research</p><h1>Start with a call.</h1><p>Choose a saved report or analyze a company and fiscal period above. Read the findings, listen to the call, and inspect the original source.</p><div className="welcome-samples"><span>Try a saved example</span>{Object.keys(COMPANIES).filter((ticker) => ticker !== "MSFT").map((ticker) => <button key={ticker} type="button" onClick={() => { discoverOnce.current = false; loadReport(`/examples/${ticker}`); }}><CompanyMark ticker={ticker} />{COMPANIES[ticker]} →</button>)}</div></div>}
          {result && <div className="results">
            <div className="report-heading"><div className="company-heading"><CompanyMark ticker={result.ticker} /><div><div className="company-title-line"><h1 ref={reportHeading} tabIndex={-1}>{COMPANIES[result.ticker] || result.ticker}</h1><span className="report-period">Fiscal Q{result.quarter} · {result.year}</span></div><p className="company-call-date">{result.ticker} · Call held <time dateTime={callDate || undefined}>{callDateLabel(callDate)}</time></p></div></div><button type="button" className="share-report" onClick={shareReport}>{shareStatus && shareStatus !== "manual" ? shareStatus : "Share ↗"}</button></div>
            {callDate && Number(callDate.slice(0, 4)) !== result.year && <p className="fiscal-note">This call took place in {callDate.slice(0, 4)} and reports the company’s <strong>fiscal Q{result.quarter} {result.year}</strong>. Fiscal years do not always match calendar years.</p>}
            {shareStatus === "manual" && <p className="share-fallback">Copy this link: <a href={reportUrl(window.location.href, result.report_id)}>{reportUrl(window.location.href, result.report_id)}</a></p>}
            <nav className="workspace-tabs" role="tablist" aria-label="Report views" onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              const tabs = Array.from(event.currentTarget.querySelectorAll('[role="tab"]'));
              const index = tabs.indexOf(event.target);
              if (index < 0) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
              tabs[next].focus(); tabs[next].click();
            }}>{[["overview", "Overview"], ["findings", "Findings"], ["concerns", "Concerns"], ["market", "Market"], ["research", "Research"]].map(([id, label]) => <button type="button" role="tab" key={id} id={`tab-${id}`} aria-selected={reportView === id} aria-controls="report-panel" tabIndex={reportView === id ? 0 : -1} onClick={() => setReportView(id)}>{label}</button>)}</nav>
            <div id="report-panel" role="tabpanel" aria-labelledby={`tab-${reportView}`} tabIndex={0} className="report-workspace">
              {reportView === "overview" && result.research?.financial_highlights.length > 0 && <section className="financial-highlights" aria-label="Company-reported financial highlights">{result.research.financial_highlights.slice(0, 3).map((metric) => <button type="button" className="financial-highlight" key={metric.id} onClick={() => setSource(metric.citations[0])} aria-label={`${metric.label}: ${metric.value}. Inspect source`}><span>{metric.label}</span><strong className="financial-value">{metric.value}</strong></button>)}</section>}
              {reportView === "market" ? <MarketPanel result={result} /> : <div className="brief-pane"><ResearchReport key={result.report_id} result={result} view={reportView} onSource={setSource} onPlayback={setPlayback} onUpgrade={() => handleSubmit(result, true)} /></div>}
            </div>
          </div>}
        </section>
        {result && reportView !== "market" && <aside className="price-rail" aria-label="Historical stock reaction"><MarketPanel result={result} compact /></aside>}
      </div>
      {result && source !== undefined && <SourceViewer key={result.report_id} reportId={result.report_id} citation={source} expectedHash={result.research?.source_hash} playback={playback} onClose={() => setSource(undefined)} />}
    </main>
    <footer className="app-footer"><span>Transcripts: <a href="https://huggingface.co/datasets/defeatbeta/yahoo-finance-data" target="_blank" rel="noreferrer">defeatbeta</a> · Analysis: Gemini · Prices: Yahoo Finance</span><a href="https://meherzad.tech" target="_blank" rel="noreferrer">Built by Meherzad Antia ↗</a></footer>
  </div>;
}
