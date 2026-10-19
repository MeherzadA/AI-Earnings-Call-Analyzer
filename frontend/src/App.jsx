import { useState, useMemo, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { apiRequest } from "./api.js";
import ResearchReport from "./ResearchReport.jsx";
import { reportIdFromSearch, reportUrl } from "./reportNavigation.js";

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
    if (loading || ticker.length < 1 || !import.meta.env.VITE_FMP_API_KEY) {
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
            <span className="spinner" /> Analyzing
          </span>
        ) : (
          <span className="btn-inner">Analyze call <span aria-hidden="true">↗</span></span>
        )}
      </button>

    </form>
  );
}

function StockPriceChart({ dailyPrices, ticker }) {
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
      <div className="chart-heading"><div><p className="card-label">Market reaction</p><h3 className="chart-title">{ticker} after the call</h3></div><span className="chart-source">Daily close · USD</span></div>
      
      <ResponsiveContainer width="100%" height={300}>
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
            tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
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
            stroke="#24533f"
            dot={{ fill: "#24533f", r: 4 }}
            activeDot={{ r: 7 }}
            isAnimationActive={false}
            name="Close Price"
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="chart-stats">
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
      </div>
      <details className="price-details"><summary>View daily prices <span>Source: Yahoo Finance</span></summary><table><caption className="sr-only">{ticker} closing prices around the earnings call</caption><thead><tr><th scope="col">Session</th><th scope="col">Date</th><th scope="col">Close (USD)</th></tr></thead><tbody>{dailyPrices.map((item) => <tr key={item.date}><th scope="row">{item.label}</th><td>{item.date}</td><td>${item.price.toFixed(2)}</td></tr>)}</tbody></table></details>
    </div>
  );
}

function ReturnMetric({ label, value }) {
  return <div className="return-metric"><span>{label}</span><strong className={value > 0 ? "gain" : value < 0 ? "loss" : ""}>{value == null ? "Unavailable" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`}</strong><small>from the call-day close</small></div>;
}

function MarketPanel({ result, compact = false }) {
  return <section className={`market-panel ${compact ? "market-panel-compact" : ""}`} aria-labelledby="market-title">
    <div className="section-heading"><div><p className="eyebrow">AFTER THE CALL</p><h2 id="market-title">Market reaction</h2></div></div>
    <div className="return-metrics"><ReturnMetric label="1 trading day" value={result.return_1day} /><ReturnMetric label="5 trading days" value={result.return_5day} /></div>
    <StockPriceChart dailyPrices={result.daily_prices} ticker={result.ticker} />
    <p className="market-caveat">Price movements provide context, not proof of what caused the reaction.</p>
  </section>;
}

function ExampleFeed({ examples, onSelect, loading, pending, error, onRetry }) {
  const cards = [
    { ticker: "AAPL", name: "Apple", period: "Q1 2024", description: "Revenue, Services, and management’s outlook." },
    { ticker: "NVDA", name: "NVIDIA", period: "Q4 2024", description: "Growth, demand, and margin guidance." },
    { ticker: "PYPL", name: "PayPal", period: "Q4 2025", description: "Payments, profitability, and the outlook." },
  ];
  return <section className="examples-section" aria-labelledby="examples-title">
    <div className="section-heading"><div><p className="eyebrow">START WITH A SAVED CALL</p><h2 id="examples-title">Explore the evidence yourself</h2></div><span>No generation needed</span></div>
    {pending && <p className="section-description" role="status">Loading saved examples… The service may need a moment to wake up.</p>}
    {error && <p className="history-notice" role="status">Saved examples aren't available right now. <button type="button" onClick={onRetry}>Try again</button></p>}
    <div className="example-grid">{cards.map((card) => {
      const report = examples.find((item) => item.ticker === card.ticker);
      return <button type="button" className="example-card" key={card.ticker} disabled={loading || !report} onClick={() => onSelect(report)}>
        <span className="example-top"><span className="example-ticker">{card.ticker}</span><span>{card.period}</span></span>
        <h3>{card.name}</h3><p>{card.description}</p><span className="example-action">{report ? "Open saved report" : pending ? "Loading saved example…" : "Example unavailable"} <span aria-hidden="true">↗</span></span>
      </button>;
    })}</div>
  </section>;
}

function HistoryFeed({ history, onSelect, sort, setSort, limit, setLimit, total, loading, error, onRetry }) {

  const filters = [
    { id: "recent",  label: "Recent" },
    { id: "movers",  label: "Largest Movement" },
    { id: "gains",   label: "Top Gains" },
    { id: "drops",   label: "Biggest Drops" },
  ];

  return (
    <section className="history-section" aria-labelledby="history-title" aria-busy={loading}>
      <div className="history-header">
        <div><h2 className="history-title" id="history-title">Saved reports <span>{total}</span></h2><p className="history-caption">Shared research from this demo</p></div>
        <div className="history-filters">
          {filters.map((f) => (
            <button
              key={f.id}
              aria-pressed={sort === f.id}
              className={`filter-btn ${sort === f.id ? "filter-active" : ""}`}
              onClick={() => setSort(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {loading && <p className="history-status" role="status">Loading saved reports… The service may take a moment to wake up.</p>}
      {error && <p className="history-notice" role="status">{error} <button type="button" onClick={onRetry}>Try again</button></p>}
      {!loading && !error && !history.length && <p className="history-status">{sort === "recent" ? "Your first completed analysis will appear here." : "No saved reports with price returns yet. Try Recent to see all reports."}</p>}
      <div className="history-list">
        {history.map((item, i) => {
          const r1 = item.return_1day;
          const positiveReturn = r1 !== null && r1 > 0;
          const negativeReturn = r1 !== null && r1 < 0;
          const sentimentColor =
            item.sentiment === "positive"
              ? "#16a34a"
              : item.sentiment === "negative"
              ? "#dc2626"
              : "#6b7280";

          return (
            <button
              type="button"
              className="history-row"
              disabled={loading}
              key={i}
              onClick={() => onSelect(item)}
            >
              <div className="history-left">
                <span className="history-ticker">{item.ticker}</span>
                <span className="history-period">
                  Q{item.quarter} {item.year}
                </span>
              </div>

              <div className="history-mid">
                <span
                  className="history-sentiment"
                  style={{ color: sentimentColor }}
                >
                  {item.sentiment
                    ? item.sentiment.charAt(0).toUpperCase() +
                      item.sentiment.slice(1)
                    : "—"}
                </span>
              </div>

              <div className="history-right">
                {r1 != null ? (
                  <span
                    className="history-return"
                    style={{
                      color: positiveReturn
                        ? "#16a34a"
                        : negativeReturn
                        ? "#dc2626"
                        : "#6b7280",
                    }}
                  >
                    {positiveReturn ? "+" : ""}
                    {r1.toFixed(2)}% <span className="return-label">1d</span>
                  </span>
                ) : (
                  <span className="history-return-na">—</span>
                )}
                {item.return_5day != null ? (
                  <span
                    className="history-return"
                    style={{
                      color:
                        item.return_5day > 0
                          ? "#16a34a"
                          : item.return_5day < 0
                          ? "#dc2626"
                          : "#6b7280",
                    }}
                  >
                    {item.return_5day > 0 ? "+" : ""}
                    {item.return_5day.toFixed(2)}%{" "}
                    <span className="return-label">5d</span>
                  </span>
                ) : (
                  <span className="history-return-na">—</span>
                )}
              </div>

              <div className="history-arrow">→</div>
            </button>
          );
        })}
        {history.length < total && (
          <button 
            className="show-more-btn"
            onClick={() => setLimit(limit + 20)}
          >
            Show more ({total - history.length} remaining)
          </button>
        )}
      </div>
    </section>
  );
}



export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [examples, setExamples] = useState([]);
  const [examplesLoading, setExamplesLoading] = useState(true);
  const [examplesError, setExamplesError] = useState(false);
  const [sort, setSort] = useState("recent");
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [shareStatus, setShareStatus] = useState("");
  const [reportView, setReportView] = useState("overview");
  const reportHeading = useRef(null);
  const requestNumber = useRef(0);
  const displayedReport = useRef(null);

  useEffect(() => { setReportView("overview"); }, [result?.report_id]);

  useEffect(() => {
    document.title = result ? `${result.ticker} Q${result.quarter} ${result.year} · Earnings Analyzer` : "Earnings Analyzer";
    setShareStatus("");
    if (result) reportHeading.current?.focus();
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
    setResult(null); setError(""); setLoading(false);
    setReportLocation(null, push);
  }

  async function loadReport(id, push = true) {
    const current = ++requestNumber.current;
    setError(""); setResult(null); setLoading("saved");
    try {
      const data = await apiRequest(`/reports/${id}`);
      if (current !== requestNumber.current) return;
      setResult(data); setReportLocation(data.report_id, push);
    } catch (err) { if (current === requestNumber.current) setError(err.message); }
    finally { if (current === requestNumber.current) setLoading(false); }
  }

  useEffect(() => {
    function navigate() {
      const id = reportIdFromSearch(window.location.search);
      // Fragment navigation must not reload the currently displayed report.
      if (id && id === displayedReport.current) return;
      if (id) loadReport(id, false);
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
    }).catch(() => { if (!cancelled) { setHistoryError("Saved reports aren't available right now."); setHistoryLoading(false); } });
    return () => { cancelled = true; };
  }, [sort, limit, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setExamplesLoading(true);
    apiRequest("/examples", { timeoutMs: 90000 }).then((data) => { if (!cancelled) { setExamples(data.examples || []); setExamplesError(false); setExamplesLoading(false); } }).catch(() => { if (!cancelled) { setExamples([]); setExamplesError(true); setExamplesLoading(false); } });
    return () => { cancelled = true; };
  }, [refreshKey]);

  async function handleSubmit({ ticker, year, quarter }, keepPrevious = false) {
    const current = ++requestNumber.current;
    const previous = keepPrevious ? result : null;
    setError(""); setResult(null); setLoading("analysis");
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

  return <div className={`app ${result ? "has-report" : ""}`}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="app-header"><div className="header-inner">
      <a className="brand" href="?" onClick={(event) => { event.preventDefault(); goHome(); }}><span className="brand-mark" aria-hidden="true">ea.</span><span><span className="brand-name">Earnings Analyzer</span><span className="brand-caption">TRANSCRIPT RESEARCH</span></span></a>
      <a className="source-link" href="https://github.com/MeherzadA/AI-Earnings-Call-Analyzer" target="_blank" rel="noreferrer">View source <span aria-hidden="true">↗</span></a>
    </div></header>
    <main className="main" id="main">
      <div className="search-section">
        {!result && <><span className="eyebrow">EARNINGS RESEARCH, WITH THE SOURCE ATTACHED</span>
        <h1 className="hero-title">Understand the quarter.<br/><span>Check the evidence.</span></h1>
        <p className="hero-sub">A concise earnings-call brief with source passages, management guidance, and the market’s reaction.</p>
        <SearchBar onSubmit={handleSubmit} loading={loading} period={result} />
        <p className="period-help">Choose the company’s fiscal year and quarter. Transcript coverage varies.</p></>}
        {result && <details className="report-search"><summary>Analyze another call <span aria-hidden="true">＋</span></summary><SearchBar onSubmit={handleSubmit} loading={loading} period={result} /></details>}
        {error && <div className="error-banner" role="alert">{error}</div>}
      </div>
      {!result && !loading && <>
        <ExampleFeed examples={examples} loading={loading} pending={examplesLoading} error={examplesError} onRetry={() => setRefreshKey((value) => value + 1)} onSelect={(item) => loadReport(item.report_id)} />
        <HistoryFeed history={history} onSelect={(item) => loadReport(item.report_id)} sort={sort} setSort={(value) => { setSort(value); setLimit(20); }} limit={limit} setLimit={setLimit} total={total} loading={historyLoading} error={historyError} onRetry={() => setRefreshKey((value) => value + 1)} />
      </>}
      {loading && <div className="loading-state" role="status" aria-live="polite">
        <div className="loading-bar"><div className="loading-fill" /></div>
        <p className="loading-text">{loading === "saved" ? "Opening the saved report…" : "Preparing your source-based report…"}<br/><span>{loading === "saved" ? "No new AI analysis is generated." : "Reading the transcript, generating findings, and checking source excerpts. The service may take a moment to wake up."}</span></p>
        <span className="elapsed" aria-hidden="true">{elapsed}s elapsed</span>
      </div>}
      {result && <div className="results">
        <div className="report-actions"><button className="back-btn" type="button" onClick={() => goHome()}>← All reports</button><button type="button" className="outline-btn" onClick={shareReport}>{shareStatus && shareStatus !== "manual" ? shareStatus : "Copy report link ↗"}</button></div>
        {shareStatus === "manual" && <p className="share-fallback">Copy this link: <a href={reportUrl(window.location.href, result.report_id)}>{reportUrl(window.location.href, result.report_id)}</a></p>}
        <div className="report-heading"><div><p className="eyebrow">EARNINGS CALL BRIEF</p><h1 ref={reportHeading} tabIndex={-1}>{result.ticker}<span>Q{result.quarter} {result.year}</span></h1></div><span className="report-status">{result.cached ? "Saved report" : "New brief saved"}</span></div>
        <nav className="workspace-tabs" role="tablist" aria-label="Report views" onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          const tabs = Array.from(event.currentTarget.querySelectorAll('[role="tab"]'));
          const index = tabs.indexOf(event.target);
          if (index < 0) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          tabs[next].focus(); tabs[next].click();
        }}>
          {(result.research ? [["overview", "Overview"], ["findings", "Findings"], ["concerns", "Concerns & risks"], ["market", "Market"], ["research", "Research context"]] : [["overview", "Overview"], ["market", "Market"]]).map(([id, label]) => <button type="button" role="tab" key={id} id={`tab-${id}`} aria-selected={reportView === id} aria-controls="report-panel" tabIndex={reportView === id ? 0 : -1} onClick={() => setReportView(id)}>{label}{id === "concerns" && <span>{result.research.findings.filter((finding) => finding.category === "risks").length}</span>}</button>)}
        </nav>
        <div id="report-panel" role="tabpanel" aria-labelledby={`tab-${reportView}`} tabIndex={0} className={reportView === "overview" ? "report-workspace overview-workspace" : "report-workspace"}>
          {reportView === "market" ? <MarketPanel result={result} /> : <>
            <div className="brief-pane"><ResearchReport key={result.report_id} result={result} view={reportView} onViewChange={setReportView} onUpgrade={() => handleSubmit(result, true)} /></div>
            {reportView === "overview" && <aside className="market-sidebar"><MarketPanel result={result} compact /></aside>}
          </>}
        </div>
        <p className="report-note">Source matching checks quotations and numeric consistency. AI interpretations may still be unsupported; inspect the evidence and context.</p>
      </div>}
    </main>
    <footer className="app-footer"><span>Transcripts: <a href="https://huggingface.co/datasets/defeatbeta/yahoo-finance-data" target="_blank" rel="noreferrer">defeatbeta</a> · Analysis: Gemini · Prices: Yahoo Finance</span><a href="https://meherzad.tech" target="_blank" rel="noreferrer">Built by Meherzad Antia ↗</a></footer>
  </div>;
}
