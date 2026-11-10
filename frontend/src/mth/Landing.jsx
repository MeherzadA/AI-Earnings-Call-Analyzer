import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import { CATEGORIES, LOGOS, companyName, filterLibrary, money, moveTone, parseMoney, periodLabel, returnAt, samePeriod, shortDate, signedPct } from "./format.js";
import { CategoryChip, CompanyLogo, Kbd, QuoteRail, Skeleton, Spark, modKey } from "./ui.jsx";

const today = () => new Date().toISOString().slice(0, 10);

export function AppBar({ variant = "landing", onHome, onCommand, onLibrary }) {
  const mod = modKey();
  return <header className={`m-bar m-bar-${variant}`}>
    <a className="m-brand" href="?" onClick={(event) => { event.preventDefault(); onHome(); }}>Earnings Analyzer</a>
    {variant === "report" && <button type="button" className="m-bar-search" onClick={onCommand}>
      <span>Search a call</span><Kbd dark label={`${mod} K`}>{mod === "⌘" ? "⌘K" : "Ctrl K"}</Kbd>
    </button>}
    <nav className="m-bar-nav" aria-label="Main">
      <button type="button" onClick={onLibrary}>Library</button>
    </nav>
  </header>;
}

function useFeatured(history) {
  const [featuredId, setFeaturedId] = useState(null);
  const [reports, setReports] = useState({});
  const pick = useMemo(() => history.find((item) => item.has_research && LOGOS[item.ticker]) || history.find((item) => item.has_research), [history]);
  const id = featuredId ?? pick?.report_id;
  useEffect(() => {
    if (!id || reports[id]) return;
    let cancelled = false;
    apiRequest(`/reports/${id}`, { timeoutMs: 60000 }).then((data) => { if (!cancelled) setReports((all) => ({ ...all, [id]: data })); })
      .catch(() => { if (!cancelled) setReports((all) => ({ ...all, [id]: { failed: true } })); });
    return () => { cancelled = true; };
  }, [id]);
  const report = reports[id];
  return [report && !report.failed ? report : null, setFeaturedId, Boolean(report?.failed)];
}

function SearchBox({ history, names, onOpen, onAnalyze, onNames }) {
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState(null);
  const [periods, setPeriods] = useState(null);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState("idle");
  const input = useRef(null);
  const symbol = query.trim();

  useEffect(() => {
    if (!symbol) { setCompanies([]); setCompany(null); setStatus("idle"); return; }
    let cancelled = false;
    setStatus("searching");
    const timer = setTimeout(() => {
      apiRequest(`/transcripts/search?q=${encodeURIComponent(symbol)}`, { timeoutMs: 15000 }).then((data) => {
        if (cancelled) return;
        setCompanies(data.companies || []);
        onNames(Object.fromEntries((data.companies || []).map((item) => [item.symbol, item.name])));
        setCompany(data.companies?.[0] || null);
        setStatus(data.companies?.length ? "ready" : "none");
      }).catch(() => { if (!cancelled) { setStatus("error"); setCompanies([]); setCompany(null); } });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [symbol]);

  useEffect(() => {
    setPeriods(null);
    if (!company) return;
    let cancelled = false;
    apiRequest(`/transcripts/${encodeURIComponent(company.symbol)}/periods`, { timeoutMs: 15000 }).then((data) => {
      if (cancelled) return;
      const sorted = (data.periods || []).filter((item) => !item.call_date || item.call_date.slice(0, 10) <= today())
        .sort((a, b) => b.year - a.year || b.quarter - a.quarter).map((item) => ({ ...item, ticker: company.symbol }));
      setPeriods(sorted);
      const ready = sorted.slice(0, 6).findIndex((item) => readyReport(item));
      setActive(Math.max(0, ready));
    }).catch(() => { if (!cancelled) setPeriods([]); });
    return () => { cancelled = true; };
  }, [company?.symbol]);

  const readyReport = (period) => history.find((item) => item.has_research && samePeriod(item, period));
  const suggestions = symbol ? (periods || []).slice(0, 6) : history.filter((item) => item.has_research).slice(0, 4);
  const choose = (item) => {
    if (!item) return;
    const ready = readyReport(item);
    if (ready) onOpen(ready); else onAnalyze({ ticker: item.ticker, year: Number(item.year), quarter: Number(item.quarter) });
  };
  function onKeyDown(event) {
    const count = suggestions.length;
    if (!count) return;
    if (["ArrowDown", "ArrowRight"].includes(event.key) && (event.key === "ArrowDown" || input.current.selectionStart === query.length)) { event.preventDefault(); setActive((i) => (i + 1) % count); }
    if (["ArrowUp", "ArrowLeft"].includes(event.key) && (event.key === "ArrowUp" || input.current.selectionStart === query.length)) { event.preventDefault(); setActive((i) => (i - 1 + count) % count); }
    if (event.key === "Escape") setQuery("");
  }
  const selected = suggestions[Math.min(active, suggestions.length - 1)];
  const showCallOptions = suggestions.length > 0 || (symbol && company && !periods);
  const hint = status === "searching" || (company && !periods) ? "Checking which calls exist…" : status === "none" ? `No transcripts match “${symbol}”. Try a ticker like NVDA.` : status === "error" ? "Coverage couldn’t be checked. Try again in a moment." : symbol && periods && !periods.length ? `No past calls found for ${company.symbol}.` : null;
  const showSearchFoot = Boolean(hint || (symbol && companies.length > 1));

  return <form className="m-search" role="search" onSubmit={(event) => { event.preventDefault(); choose(selected); }}>
    <label className="m-search-field">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
      <span className="sr-only">Company or ticker</span>
      <input ref={input} value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={onKeyDown} placeholder="Ticker or name" autoComplete="off" spellCheck={false} maxLength={80}
        role="combobox" aria-expanded={suggestions.length > 0} aria-controls={showCallOptions ? "m-search-calls" : undefined} aria-activedescendant={selected ? `m-call-${suggestions.indexOf(selected)}` : undefined} aria-describedby={showSearchFoot ? "m-search-hint" : undefined} />
      <button type="submit" className="m-search-go" disabled={!selected}>{selected && readyReport(selected) ? "Open report" : "Analyze call"}<span aria-hidden="true">⏎</span></button>
    </label>
    {showCallOptions && <div className="m-search-row">
      {symbol && company ? <CompanyLogo ticker={company.symbol} size={28} radius={8} /> : <span className="m-search-row-label">{history.length ? "Ready now" : ""}</span>}
      <div className="m-search-calls" id="m-search-calls" role="listbox" aria-label={symbol && company ? `${company.name} calls` : "Calls ready to open"}>
        {symbol && company && !periods && [0, 1, 2, 3].map((i) => <Skeleton key={i} width={104} height={34} radius={999} />)}
        {suggestions.map((item, index) => {
          const ready = !symbol || readyReport(item);
          return <button type="button" role="option" id={`m-call-${index}`} key={`${item.ticker}-${item.year}-${item.quarter}`} aria-selected={index === active} className={`m-qchip ${index === active ? "is-active" : ""}`}
            onMouseEnter={() => setActive(index)} onClick={() => choose(item)} title={item.call_date ? `Call on ${shortDate(item.call_date)}` : undefined}>
            {!symbol && <CompanyLogo ticker={item.ticker} size={20} radius={6} />}
            {!symbol ? `${companyName(item.ticker, names)} ${periodLabel(item)}` : periodLabel(item)}
            <span className={`m-qchip-state ${ready ? "is-ready" : ""}`}>{ready ? "Ready" : "About 40 sec"}</span>
          </button>;
        })}
      </div>
      <span className="m-search-keys" aria-hidden="true">↑↓ ⏎</span>
    </div>}
    {showSearchFoot && <div className="m-search-foot" id="m-search-hint" aria-live="polite">
      {hint && <span>{hint}</span>}
      {symbol && companies.length > 1 && <span className="m-search-alts">Not it?{companies.slice(0, 5).filter((item) => item.symbol !== company?.symbol).slice(0, 4).map((item) => <button type="button" key={item.symbol} onClick={() => setCompany(item)}><b>{item.symbol}</b> {item.name}</button>)}</span>}
    </div>}
  </form>;
}

function Preview({ report, history, names, onPick, onOpen, historyState }) {
  const [selected, setSelected] = useState(null);
  const box = useRef(null);
  useEffect(() => { setSelected(null); }, [report?.report_id]);
  if (!report) return historyState === "loading"
    ? <div className="m-win m-win-loading" ref={box} role="status"><Skeleton height={68} /><div className="m-win-body"><Skeleton height={60} /><Skeleton height={120} /></div></div>
    : <p className="m-win-empty" role={historyState === "error" ? "status" : undefined}>{historyState === "error" ? "The saved report preview couldn’t load. Try again or search for a call above." : "Search for a call above to see a report with its sources."}</p>;
  const findings = report.research.findings;
  const open = selected ?? findings.findIndex((item) => item.category === "guidance");
  const siblings = history.filter((item) => item.ticker === report.ticker && item.has_research).sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  const prices = report.daily_prices || [];
  const tone = { positive: 75, neutral: 50, negative: 25 }[report.research.management_tone] ?? 50;
  return <div className="m-win" ref={box}>
    <div className="m-win-bar">
      <CompanyLogo ticker={report.ticker} size={40} radius={11} alt={companyName(report.ticker, names)} />
      <b>{companyName(report.ticker, names)}</b>
      {siblings.length > 1 && <nav className="m-pill-tabs" aria-label={`${companyName(report.ticker, names)} calls`}>{siblings.map((item) => <button type="button" key={item.report_id} aria-current={item.report_id === report.report_id ? "true" : undefined} onClick={() => onPick(item.report_id)}>{periodLabel(item)}</button>)}</nav>}
      <span className="m-grow" />
      <button type="button" className="m-win-open" onClick={() => onOpen(report)}>Open the full report →</button>
    </div>
    <div className="m-win-grid">
      <div className="m-win-main">
        <p className="m-win-lede">{findings[0].observation}</p>
        <div className="m-win-mets">{report.research.financial_highlights.slice(0, 4).map((metric) => <div className="m-met" key={metric.id}><b>{metric.value.length > 12 ? (parseMoney(metric.value) ? money(parseMoney(metric.value)) : metric.value.replace(/ year over year/i, " y/y")) : metric.value}</b><small>{metric.label}<span>{metric.citations[0].passage_id}</span></small></div>)}</div>
        <div className="m-win-finds">
          <p className="m-eyebrow">{findings.length} findings</p>
          {findings.slice(0, 5).map((finding, index) => <div key={finding.id} className={`m-pfind ${index === open ? "is-open" : ""}`}>
            <button type="button" aria-expanded={index === open} onClick={() => setSelected(index === open ? -1 : index)}>
              <CategoryChip category={finding.category} /><span className="m-pfind-head">{finding.headline}</span><span className="m-src">{finding.citations[0].passage_id} ✓</span>
            </button>
            {index === open && <p className="m-pfind-quote">“<mark>{finding.citations[0].quote}</mark>”</p>}
          </div>)}
        </div>
      </div>
      <div className="m-win-side">
        <div className="m-card">
          <p className="m-eyebrow">After the call</p>
          <Spark prices={prices.slice(0, 7)} stroke={(returnAt(report, prices, 5) ?? 0) < 0 ? "#C2492B" : "#1E7A46"} dot={(returnAt(report, prices, 5) ?? 0) < 0 ? "#C2492B" : "#1E7A46"} height={96} />
          <div className="m-card-pair">
            {[["Next day", 1], ["5 days", 5]].map(([label, session]) => { const value = returnAt(report, prices, session); return <span key={label}><small>{label}</small><b className={`m-num m-move-${moveTone(value)}`}>{signedPct(value)}</b></span>; })}
          </div>
        </div>
        <div className="m-card">
          <p className="m-eyebrow">Tone · the model’s read</p>
          <div className="m-gauge" role="img" aria-label={`Tone: ${report.research.management_tone}, as read by the model`}><span style={{ left: `${tone}%` }} /></div>
          <div className="m-gauge-scale"><span>Cautious</span><b>{report.research.management_tone[0].toUpperCase() + report.research.management_tone.slice(1)}</b></div>
        </div>
      </div>
    </div>
  </div>;
}

function Library({ history, total, state, names, onOpen, onRetry, libraryRef }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const items = history.filter((item) => item.has_research);
  const fell = items.filter((item) => item.return_1day < 0).length;
  const rose = items.filter((item) => item.return_1day > 0).length;
  const visible = filterLibrary(items, filter, query, names);
  return <section className="m-library" ref={libraryRef} id="library" aria-labelledby="library-title">
    <div className="m-section-head">
      <div><p className="m-eyebrow m-eyebrow-mint">The library</p><h2 className="m-h2" id="library-title">Saved reports.</h2></div>
      <div className="m-lib-tools">
        <label className="m-lib-filter"><span className="sr-only">Filter the library</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by company or period" /></label>
        <div className="m-chips" role="group" aria-label="Filter by next-day move">
          {[["all", `All ${items.length}`], ["fell", `Fell next day · ${fell}`], ["rose", `Rose next day · ${rose}`]].map(([id, label]) => <button type="button" key={id} aria-pressed={filter === id} className="m-chip" onClick={() => setFilter(id)}>{label}</button>)}
        </div>
      </div>
    </div>
    {state === "error" && <p className="m-lib-status" role="alert">The library couldn’t load. <button type="button" onClick={onRetry}>Try again</button></p>}
    <div className="m-lib-grid">
      {state === "loading" && !items.length && Array.from({ length: 8 }, (_, i) => <div className="m-lib-card is-skeleton" key={i}><Skeleton width={40} height={40} radius={11} /><span className="m-grow"><Skeleton width="70%" height={14} /><Skeleton width="40%" height={10} style={{ marginTop: 6 }} /></span></div>)}
      {visible.map((item) => <a key={item.report_id} className="m-lib-card" href={`?report=${item.report_id}`} onClick={(event) => { event.preventDefault(); onOpen(item); }}>
        <CompanyLogo ticker={item.ticker} size={40} radius={11} />
        <span className="m-grow m-lib-text"><b>{companyName(item.ticker, names)}</b><span className="m-mono">{periodLabel(item)} · {shortDate(item.call_date)}</span></span>
        <span className={`m-pill m-pill-${moveTone(item.return_1day)}`}>{item.return_1day == null ? "No prices" : signedPct(item.return_1day)}</span>
      </a>)}
    </div>
    {state === "ready" && !visible.length && <p className="m-lib-status">{items.length ? "Nothing matches that filter." : "No reports yet. Search for a company above to start."}</p>}
    <p className="m-lib-foot">Move = next-day close vs. call-day close.{total > items.length ? ` Showing ${items.length} of ${total}.` : ""}</p>
  </section>;
}

export default function Landing({ history, total, historyState, names, onNames, onOpen, onAnalyze, onCommand, onRetry }) {
  const [featured, setFeaturedId] = useFeatured(history);
  const libraryRef = useRef(null);
  const mod = modKey();
  const prices = (featured?.daily_prices || []).slice(0, 7);
  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  return <div className="m-landing">
    <section className={`m-hero ${featured ? "" : "m-hero-no-chart"}`}>
      <AppBar variant="landing" onHome={() => window.scrollTo({ top: 0 })} onCommand={onCommand} onLibrary={() => scrollTo(libraryRef)} />
      <div className="m-hero-center">
        <h1 className="m-hero-title">Review an earnings call.</h1>
        <p className="m-hero-sub">Search a company or ticker to open a report or analyze a past call.</p>
        <SearchBox history={history} names={names} onOpen={onOpen} onAnalyze={onAnalyze} onNames={onNames} />
      </div>
      <div className="m-hero-rail">
        {featured ? <>
          <p className="m-rail-caption">{companyName(featured.ticker)} after its {periodLabel(featured)} call</p>
          {prices.length > 1 ? <QuoteRail prices={prices} height={220} label={`${companyName(featured.ticker)} closing price for ${prices.length - 1} trading days after its ${periodLabel(featured)} call, from $${prices[0].price.toFixed(2)} to $${prices.at(-1).price.toFixed(2)}.`} />
            : <p className="m-hero-empty">Closing prices aren’t available for this call. Search for another report above.</p>}
        </> : <p className="m-hero-empty" role={historyState === "error" ? "status" : undefined}>{historyState === "error" ? "The saved calls couldn’t load. Search by company or ticker above." : historyState === "loading" ? "Loading saved calls…" : "Search for a company or ticker to find a call."}</p>}
      </div>
    </section>

    <section className="m-what" aria-labelledby="what-title">
      <div className="m-section-head">
        <div><p className="m-eyebrow m-eyebrow-green">Report contents</p><h2 className="m-h2" id="what-title">Call findings and results.</h2></div>
        <p className="m-section-lede">Review financial results, cited findings, and price changes after the call.</p>
      </div>
      <div className="m-what-stage">
        <Preview report={featured} history={history} names={names} onPick={setFeaturedId} onOpen={onOpen} historyState={historyState} />
      </div>
    </section>

    <section className="m-instant" aria-labelledby="instant-title">
      <p className="m-eyebrow m-eyebrow-green">How it works</p>
      <h2 className="m-h2" id="instant-title">From transcript to report.</h2>
      <div className="m-feats">
        <div className="m-feat">
          <b>Saved calls</b>
          <span className="m-feat-note">Open a report from the library without running the analysis again.</span>
        </div>
        <div className="m-feat">
          <b>New calls</b>
          <span className="m-feat-note">We find a transcript, check each quote and number, then save the report.</span>
        </div>
        <div className="m-feat">
          <b>Keyboard shortcuts</b>
          <span className="m-feat-note"><Kbd>{mod === "⌘" ? "⌘K" : "Ctrl K"}</Kbd> to search; <Kbd>J</Kbd> and <Kbd>K</Kbd> to move between findings.</span>
          <button type="button" className="m-feat-cmd" onClick={onCommand}>Search calls</button>
        </div>
      </div>
    </section>

    <Library history={history} total={total} state={historyState} names={names} onOpen={onOpen} onRetry={onRetry} libraryRef={libraryRef} />
    <SiteFooter />
  </div>;
}

export function SiteFooter() {
  return <footer className="m-footer">
    <div><span className="m-footer-brand">Earnings Analyzer</span><span className="m-mono m-footer-src">Transcripts: <a href="https://huggingface.co/datasets/defeatbeta/yahoo-finance-data" target="_blank" rel="noreferrer">DefeatBeta</a> · Analysis: Gemini · Prices: Yahoo Finance</span></div>
    <p>Tone is the model’s read, not a fact. Not investment advice.<br />Built by <a href="https://meherzad.tech" target="_blank" rel="noreferrer">Meherzad Antia</a> · <a href="https://github.com/MeherzadA/AI-Earnings-Call-Analyzer" target="_blank" rel="noreferrer">GitHub</a></p>
  </footer>;
}
