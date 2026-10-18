import { useState, useMemo, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { apiRequest } from "./api.js";

function currentQuarter(date) {
  const month = date.getMonth() + 1;
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

function SearchBar({ onSubmit, loading }) {
  const today = useMemo(() => new Date(), []);
  const completedPeriod = useMemo(() => new Date(today.getFullYear(), today.getMonth() - 3, 1), [today]);
  const [ticker, setTicker] = useState("");
  const [year, setYear] = useState(completedPeriod.getFullYear());
  const [quarter, setQuarter] = useState(currentQuarter(completedPeriod));
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

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
      <div className="search-example">
        <span>Explore a real call</span>
        <button type="button" disabled={loading} onClick={() => {
          setTicker("AAPL"); setYear(2024); setQuarter(1); setShowSuggestions(false);
          onSubmit({ ticker: "AAPL", year: 2024, quarter: 1 });
        }}>Try Apple, Q1 2024 <span aria-hidden="true">→</span></button>
      </div>
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

function SentimentCard({ sentiment, score }) {
  const colors = {
    positive: { bg: "#f0faf4", border: "#a3d9b6", text: "#1a6b3c", label: "#2d9e5f" },
    negative: { bg: "#fff4f4", border: "#f5b8b8", text: "#8b1a1a", label: "#d44" },
    neutral:  { bg: "#f5f5f5", border: "#d0d0d0", text: "#444",    label: "#777" },
  };
  const c = colors[sentiment?.toLowerCase()] || colors.neutral;
  const pct = Number.isFinite(score) ? Math.max(0, Math.min(100, ((score + 1) / 2) * 100)) : 50;

  const barColor =
    score > 0.2 ? "#2d9e5f" : score < -0.2 ? "#d44444" : "#999";

  return (
    <div className="card sentiment-card" style={{ background: c.bg, borderColor: c.border }}>
      <p className="card-label">Management sentiment</p>
      <p className="sentiment-label" style={{ color: c.label }}>
        {sentiment ? sentiment.charAt(0).toUpperCase() + sentiment.slice(1) : "—"}
      </p>
      <div className="score-row">
        <span className="score-val" style={{ color: c.text }}>
          {score != null ? score.toFixed(2) : "—"}
        </span>
        <div className="score-track">
          <div
            className="score-fill"
            style={{ width: `${pct}%`, background: barColor }}
          />
          <div className="score-midline" />
        </div>
      </div>
      <div className="score-axis">
        <span>−1</span>
        <span>0</span>
        <span>+1</span>
      </div>
      <p className="sentiment-note">AI assessment of the call’s tone</p>
    </div>
  );
}

function SummaryCard({ summary, ticker, year, quarter, cached }) {
  return (
    <div className="card summary-card">
      <div className="summary-header">
        <div>
          <p className="card-label">The quarter in focus</p>
          <p className="summary-meta">
            {ticker} · Q{quarter} {year}
            {cached && <span className="cached-badge">Saved report</span>}
          </p>
        </div>
      </div>
      <p className="summary-text">{summary}</p>
    </div>
  );
}

function TabsSection({ keyClaims, redFlags, opportunities }) {
  const [active, setActive] = useState("claims");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [active]);

  const tabs = [
    { id: "claims",       label: "Key Claims",    data: keyClaims,    color: "#2563eb" },
    { id: "flags",        label: "Red Flags",     data: redFlags,     color: "#dc2626" },
    { id: "opportunities",label: "Opportunities", data: opportunities, color: "#16a34a" },
  ];

  const current = tabs.find((t) => t.id === active);

  return (
    <div className="card tabs-card">
      <div className="tabs-header" role="tablist" aria-label="Report insights">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onKeyDown={(event) => {
              const index = tabs.findIndex((tab) => tab.id === active);
              const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
              if (next !== null) { event.preventDefault(); setActive(tabs[next].id); document.getElementById(`tab-${tabs[next].id}`)?.focus(); }
            }}
            className={`tab-btn ${active === t.id ? "tab-active" : ""}`}
            style={active === t.id ? { borderBottomColor: t.color, color: t.color } : {}}
            onClick={() => setActive(t.id)}
          >
            {t.label}
            <span className="tab-count">{t.data?.length ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="tab-content" id={`panel-${active}`} role="tabpanel" aria-labelledby={`tab-${active}`} tabIndex={0}>
        {current?.data?.length ? (
          current.data.slice(0, expanded ? current.data.length : 5).map((item, i) => (
            <div className="list-item" key={i}>
              <span
                className="list-dot"
                style={{ background: current.color }}
              />
              <p>{item}</p>
            </div>
          ))
        ) : (
          <p className="empty-tab">None reported for this period.</p>
        )}
        {current?.data?.length > 5 && <button className="show-more-btn" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Show fewer" : `View all ${current.data.length} ${current.label.toLowerCase()}`} <span aria-hidden="true">{expanded ? "↑" : "↓"}</span></button>}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-heading"><span className="eyebrow">INSIDE YOUR REPORT</span><h2>The call, without the noise.</h2></div>
      <div className="feature-grid">
        <div><span className="feature-number">01</span><h3>The story</h3><p>A clear summary of management's outlook and the tone behind it.</p></div>
        <div><span className="feature-number">02</span><h3>The signals</h3><p>Key claims, potential risks, and opportunities worth a closer look.</p></div>
        <div><span className="feature-number">03</span><h3>The reaction</h3><p>The next five trading days of price movement, when available.</p></div>
      </div>
    </div>
  );
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
                {item.sentiment_score != null && (
                  <div className="history-score-track">
                    <div
                      className="history-score-fill"
                      style={{
                        width: `${((item.sentiment_score + 1) / 2) * 100}%`,
                        background: sentimentColor,
                      }}
                    />
                  </div>
                )}
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
  const [sort, setSort] = useState("recent");

  const [limit, setLimit] = useState(20);

  const [total, setTotal] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const reportHeading = useRef(null);

  useEffect(() => {
    document.title = result ? `${result.ticker} Q${result.quarter} ${result.year} · Earnings Analyzer` : "Earnings Analyzer";
    if (result) reportHeading.current?.focus();
  }, [result]);

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  function handleSortChange(newSort) {
    setSort(newSort);
    setLimit(20);
}

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    apiRequest(`/history?sort=${sort}&limit=${limit}`, { timeoutMs: 90000 })
        .then((data) => {
          if (cancelled) return;
          setHistory(data.history || []);
          setTotal(data.total || 0);
          setHistoryError("");
          setHistoryLoading(false);
        })
        .catch(() => { if (!cancelled) { setHistoryError("Saved reports aren't available right now."); setHistoryLoading(false); } });
    return () => { cancelled = true; };
  }, [sort, limit, refreshKey]);

  async function handleSubmit({ ticker, year, quarter }) {
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const data = await apiRequest("/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, year, quarter }),
      });
      setResult(data);
      setRefreshKey((value) => value + 1);

    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleHistoryClick(item) {
    handleSubmit({
        ticker: item.ticker,
        year: item.year,
        quarter: Number(item.quarter),
    });
 }



  return (
    <div className={`app ${result ? "has-report" : ""}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">ea.</span>
            <div><span className="brand-name">Earnings Analyzer</span><span className="brand-caption">TRANSCRIPT RESEARCH</span></div>
          </div>
          <a className="source-link" href="https://github.com/MeherzadA/AI-Earnings-Call-Analyzer" target="_blank" rel="noreferrer">View source <span aria-hidden="true">↗</span></a>
        </div>
      </header>

      <main className="main" id="main">
        <div className="search-section">
          <span className="eyebrow">A CLOSER LOOK AT COMPANY EARNINGS</span>
          <h1 className="hero-title">Read the call.<br/><span>See what matters.</span></h1>
          <p className="hero-sub">
            Turn a US-listed company's earnings call into a clear summary, key signals, and the market's reaction.
          </p>
          <SearchBar onSubmit={handleSubmit} loading={loading} />
          <p className="period-help">Choose the company’s fiscal year and quarter. Transcript coverage varies.</p>
          {error && <div className="error-banner" role="alert">{error}</div>}
        </div>

        {!result && !loading && (
          <>
            <EmptyState />
            <HistoryFeed history={history} onSelect={handleHistoryClick} sort={sort} setSort={handleSortChange} limit={limit} setLimit={setLimit} total={total} loading={historyLoading} error={historyError} onRetry={() => setRefreshKey((value) => value + 1)} />
          </>
        )}

        {loading && (
          <div className="loading-state" role="status" aria-live="polite">
            <div className="loading-bar">
              <div className="loading-fill" />
            </div>
            <p className="loading-text">
                Preparing your report… <br/>
                <span style={{ fontSize: "12px", opacity: 0.7 }}>
                    Fetching the transcript and running analysis. The first request can take longer while the service wakes up.
                </span>
            </p>
            <span className="elapsed" aria-hidden="true">{elapsed}s elapsed</span>
          </div>
        )}

        {result && (
            <div className="results">
                <button 
                    className="back-btn"
                    onClick={() => setResult(null)}
                >
                    ← All reports
                </button>
            <div className="report-heading"><div><p className="eyebrow">EARNINGS CALL RESEARCH</p><h1 ref={reportHeading} tabIndex={-1}>{result.ticker}<span>Q{result.quarter} {result.year}</span></h1></div><span className="report-status"><span aria-hidden="true">●</span> {result.cached ? "Saved report" : "Analysis complete · saved"}</span></div>
            <div className="top-row">
              <SentimentCard
                sentiment={result.analysis?.sentiment}
                score={result.analysis?.sentiment_score}
              />
              <SummaryCard
                summary={result.analysis?.summary}
                ticker={result.ticker}
                year={result.year}
                quarter={result.quarter}
                cached={result.cached}
              />
            </div>
            <div className="return-metrics"><ReturnMetric label="1 trading day" value={result.return_1day} /><ReturnMetric label="5 trading days" value={result.return_5day} /><div className="return-context"><span className="card-label">Price context</span><p>How the stock moved after the call, alongside management’s outlook.</p></div></div>
              <StockPriceChart
                dailyPrices={result.daily_prices}
                ticker={result.ticker}
              />
            <TabsSection
              key={`${result.ticker}-${result.year}-${result.quarter}`}
              keyClaims={result.analysis?.key_claims}
              redFlags={result.analysis?.red_flags}
              opportunities={result.analysis?.opportunities}
            />
            <p className="report-note">AI-generated from the earnings call transcript. Review the original statements when researching a company.</p>
          </div>
        )}
      </main>
      <footer className="app-footer"><span>Transcripts: <a href="https://huggingface.co/datasets/defeatbeta/yahoo-finance-data" target="_blank" rel="noreferrer">defeatbeta</a> · Analysis: Gemini · Prices: Yahoo Finance</span><a href="https://meherzad.tech" target="_blank" rel="noreferrer">Built by Meherzad Antia ↗</a></footer>
    </div>
  );
}
