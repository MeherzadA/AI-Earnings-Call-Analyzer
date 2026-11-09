import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import { CATEGORIES, LOGOS, companyName, filterLibrary, money, moveTone, parseMoney, periodLabel, railQuotes, returnAt, samePeriod, shortDate, signedPct } from "./format.js";
import { CategoryChip, CompanyLogo, Kbd, QuoteRail, Skeleton, Spark, modKey } from "./ui.jsx";

const today = () => new Date().toISOString().slice(0, 10);

export function AppBar({ variant = "landing", onHome, onCommand, onLibrary, onHowItWorks }) {
  const mod = modKey();
  return <header className={`m-bar m-bar-${variant}`}>
    <a className="m-brand" href="?" onClick={(event) => { event.preventDefault(); onHome(); }}><span className="m-brand-mark" aria-hidden="true">¶</span>minus the hour</a>
    {variant === "report" && <button type="button" className="m-bar-search" onClick={onCommand}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
      <span>Search another company or quarter</span><Kbd dark label={`${mod} K`}>{mod === "⌘" ? "⌘K" : "Ctrl K"}</Kbd>
    </button>}
    <nav className="m-bar-nav" aria-label="Main">
      <button type="button" onClick={onLibrary}>Library</button>
      {variant === "landing" && <button type="button" onClick={onHowItWorks}>How it works</button>}
      <a href="https://github.com/MeherzadA/AI-Earnings-Call-Analyzer" target="_blank" rel="noreferrer" className={variant === "landing" ? "is-filled" : ""}>GitHub</a>
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
  const hint = status === "searching" || (company && !periods) ? "Checking which calls exist…" : status === "none" ? `No transcripts match “${symbol}”. Try a ticker like NVDA.` : status === "error" ? "Coverage couldn’t be checked. Try again in a moment." : symbol && periods && !periods.length ? `No past calls found for ${company.symbol}.` : null;

  return <form className="m-search" role="search" onSubmit={(event) => { event.preventDefault(); choose(selected); }}>
    <label className="m-search-field">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
      <span className="sr-only">Company or ticker</span>
      <input ref={input} value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={onKeyDown} placeholder="Type a company — NVIDIA, AAPL…" autoComplete="off" spellCheck={false} maxLength={80}
        role="combobox" aria-expanded={suggestions.length > 0} aria-controls="m-search-calls" aria-activedescendant={selected ? `m-call-${suggestions.indexOf(selected)}` : undefined} aria-describedby="m-search-hint" />
      <button type="submit" className="m-search-go" disabled={!selected}>Read the call <span aria-hidden="true">⏎</span></button>
    </label>
    <div className="m-search-row">
      {symbol && company ? <CompanyLogo ticker={company.symbol} size={28} radius={8} /> : <span className="m-search-row-label">{history.length ? "Ready now" : ""}</span>}
      <div className="m-search-calls" id="m-search-calls" role="listbox" aria-label={symbol && company ? `${company.name} calls` : "Calls ready to open"}>
        {symbol && company && !periods && [0, 1, 2, 3].map((i) => <Skeleton key={i} width={104} height={34} radius={999} />)}
        {suggestions.map((item, index) => {
          const ready = !symbol || readyReport(item);
          return <button type="button" role="option" id={`m-call-${index}`} key={`${item.ticker}-${item.year}-${item.quarter}`} aria-selected={index === active} className={`m-qchip ${index === active ? "is-active" : ""}`}
            onMouseEnter={() => setActive(index)} onClick={() => choose(item)} title={item.call_date ? `Call on ${shortDate(item.call_date)}` : undefined}>
            {!symbol && <CompanyLogo ticker={item.ticker} size={20} radius={6} />}
            {!symbol ? `${companyName(item.ticker, names)} ${periodLabel(item)}` : periodLabel(item)}
            <span className={`m-qchip-state ${ready ? "is-ready" : ""}`}>● {ready ? "Ready" : "~40s"}</span>
          </button>;
        })}
      </div>
      <span className="m-search-keys" aria-hidden="true">↑↓ ⏎</span>
    </div>
    {(hint || (symbol && companies.length > 1)) && <div className="m-search-foot" id="m-search-hint" aria-live="polite">
      {hint && <span>{hint}</span>}
      {symbol && companies.length > 1 && <span className="m-search-alts">Not it?{companies.slice(0, 5).filter((item) => item.symbol !== company?.symbol).slice(0, 4).map((item) => <button type="button" key={item.symbol} onClick={() => setCompany(item)}><b>{item.symbol}</b> {item.name}</button>)}</span>}
    </div>}
  </form>;
}

function Floaters({ report, onOpen }) {
  if (!report) return <div className="m-floaters" aria-hidden="true">
    <div className="m-obj m-obj-1"><Skeleton width="40%" height={12} /><Skeleton height={18} style={{ marginTop: 10 }} /><Skeleton height={44} style={{ marginTop: 12 }} radius={12} /></div>
    <div className="m-obj m-obj-2"><Skeleton width={54} height={54} radius={14} /><Skeleton width={140} height={18} /></div>
  </div>;
  const findings = report.research.findings;
  const guidance = findings.find((item) => item.category === "guidance") || findings[0];
  const metric = report.research.financial_highlights[0];
  const prices = report.daily_prices || [];
  const fifth = returnAt(report, prices, 5);
  return <div className="m-floaters">
    <button type="button" className="m-obj m-obj-1" onClick={onOpen} aria-label={`Open ${report.ticker} ${periodLabel(report)}: ${guidance.headline}`}>
      <span className="m-eyebrow" style={{ color: CATEGORIES[guidance.category]?.fg }}>{CATEGORIES[guidance.category]?.label}</span>
      <span className="m-obj-head">{guidance.headline}</span>
      <span className="m-obj-quote"><mark>“{guidance.citations[0].quote.length > 110 ? `${guidance.citations[0].quote.slice(0, 108).replace(/\s+\S*$/, "")}…` : guidance.citations[0].quote}”</mark></span>
    </button>
    <button type="button" className="m-obj m-obj-2" onClick={onOpen} aria-label={`Open ${companyName(report.ticker)} ${periodLabel(report)}`}>
      <CompanyLogo ticker={report.ticker} size={54} radius={14} />
      <span className="m-obj-stack"><b>{companyName(report.ticker)} · {periodLabel(report)}</b><span>{findings.length} findings · tone {report.research.management_tone}</span></span>
    </button>
    {metric && <button type="button" className="m-obj m-obj-3" onClick={onOpen} aria-label={`${metric.label}: ${metric.value}`}>
      <span className="m-eyebrow">{metric.label.length > 18 ? metric.label.split(" ").slice(0, 2).join(" ") : metric.label}</span>
      <span className="m-obj-num">{parseMoney(metric.value) ? money(parseMoney(metric.value)) : metric.value.split(" ")[0]}</span>
    </button>}
    {fifth != null && <button type="button" className="m-obj m-obj-4" onClick={onOpen} aria-label={`5 days after: ${signedPct(fifth)}`}>
      <span className="m-eyebrow">5 days after</span><b className={`m-num m-move-${moveTone(fifth)}`}>{signedPct(fifth)}</b>
    </button>}
  </div>;
}

function Marquee({ history, names, onOpen }) {
  const items = history.filter((item) => item.has_research);
  if (!items.length) return <div className="m-marquee" aria-hidden="true"><div className="m-marq-track is-static">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} width={180} height={28} radius={8} style={{ opacity: 0.25 }} />)}</div></div>;
  const loop = [];
  while (loop.length < 10) loop.push(...items);
  return <nav className="m-marquee" aria-label="Calls in the library">
    <div className="m-marq-track">
      {[...loop, ...loop].map((item, index) => <a key={index} href={`?report=${item.report_id}`} tabIndex={index < loop.length && index < items.length ? 0 : -1} aria-hidden={index >= items.length || undefined} onClick={(event) => { event.preventDefault(); onOpen(item); }}>
        <CompanyLogo ticker={item.ticker} size={28} radius={8} />{companyName(item.ticker, names)} {periodLabel(item)} <span className={`m-mono m-move-${moveTone(item.return_1day)}-ink`}>{signedPct(item.return_1day)}</span>
      </a>)}
    </div>
  </nav>;
}

function Preview({ report, history, names, onPick, onOpen }) {
  const [selected, setSelected] = useState(null);
  const [passages, setPassages] = useState(null);
  const box = useRef(null);
  useEffect(() => { setSelected(null); setPassages(null); }, [report?.report_id]);
  useEffect(() => {
    if (!report || passages) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      apiRequest(`/reports/${report.report_id}/transcript`, { timeoutMs: 60000 }).then((data) => setPassages(data.passages.length)).catch(() => setPassages(0));
    }, { rootMargin: "300px" });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [report?.report_id, passages]);
  if (!report) return <div className="m-win m-win-loading" ref={box}><Skeleton height={78} radius={0} /><div className="m-win-body"><Skeleton height={60} /><Skeleton height={80} /><Skeleton height={240} /></div></div>;
  const findings = report.research.findings;
  const open = selected ?? findings.findIndex((item) => item.category === "guidance");
  const siblings = history.filter((item) => item.ticker === report.ticker && item.has_research).sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  const prices = report.daily_prices || [];
  const cited = new Set(findings.flatMap((item) => item.citations.map((citation) => citation.passage_id)));
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
        <div className="m-card m-card-grow">
          <p className="m-eyebrow">Transcript · {passages ? `${passages} passages` : "passages"}</p>
          <div className="m-pgrid">
            {passages ? Array.from({ length: passages }, (_, i) => <button type="button" key={i} className={cited.has(`P${i + 1}`) ? "is-cited" : ""} aria-label={`Passage ${i + 1}${cited.has(`P${i + 1}`) ? ", cited by a finding" : ""}`} tabIndex={cited.has(`P${i + 1}`) ? 0 : -1} onClick={() => onOpen(report, `P${i + 1}`)} />)
              : Array.from({ length: 34 }, (_, i) => <Skeleton key={i} height={26} radius={5} />)}
          </div>
          <p className="m-card-note">Dark squares are where the findings came from. Click one to read it in place.</p>
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
      <div><p className="m-eyebrow m-eyebrow-mint">The library</p><h2 className="m-h2" id="library-title">Pick one up.</h2></div>
      <div className="m-lib-tools">
        <label className="m-lib-filter"><span className="sr-only">Filter the library</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter" /></label>
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
    {state !== "loading" && !visible.length && <p className="m-lib-status">{items.length ? "Nothing matches that filter." : "No calls have been read yet. Search for one above."}</p>}
    <p className="m-lib-foot">Move = next-day close vs. call-day close.{total > items.length ? ` Showing ${items.length} of ${total}.` : ""}</p>
  </section>;
}

export default function Landing({ history, total, historyState, names, onNames, onOpen, onAnalyze, onCommand, onRetry }) {
  const [featured, setFeaturedId] = useFeatured(history);
  const libraryRef = useRef(null);
  const howRef = useRef(null);
  const mod = modKey();
  const prices = (featured?.daily_prices || []).slice(0, 7);
  const quotes = featured ? railQuotes(featured.research.findings) : [];
  const ready = history.filter((item) => item.has_research);
  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  const openFeatured = (passage) => featured && onOpen(featured, passage);
  // The API sleeps between visits; say so if the library is slow instead of leaving a blank stage.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (historyState !== "loading") { setSlow(false); return; }
    const timer = setTimeout(() => setSlow(true), 2500);
    return () => clearTimeout(timer);
  }, [historyState]);
  return <div className="m-landing">
    <section className="m-hero">
      <AppBar variant="landing" onHome={() => window.scrollTo({ top: 0 })} onCommand={onCommand} onLibrary={() => scrollTo(libraryRef)} onHowItWorks={() => scrollTo(howRef)} />
      <Floaters report={featured} onOpen={() => openFeatured()} />
      <div className="m-hero-center">
        <h1 className="m-hero-title">Earnings calls,<br /><span>minus the hour.</span></h1>
        <p className="m-hero-sub">Type a company. Get what was said on its call, the stock’s reaction, and the exact line behind every claim.</p>
        <SearchBox history={history} names={names} onOpen={onOpen} onAnalyze={onAnalyze} onNames={onNames} />
        <p className="m-wake" role="status" aria-live="polite">{slow ? <><span className="m-wake-dot" aria-hidden="true" />Waking the app up. After some time away this takes a few seconds; your reports will appear on their own.</> : ""}</p>
      </div>
      <div className="m-hero-rail">
        <p className="m-rail-caption"><span aria-hidden="true" />{featured ? `${featured.ticker} after its ${periodLabel(featured)} call — written in the call’s own words` : "Loading a call from the library…"}</p>
        <QuoteRail prices={prices} quotes={quotes} height={300} label={featured && prices.length > 1 ? `${companyName(featured.ticker)} closing price for ${prices.length - 1} trading days after its ${periodLabel(featured)} call, from $${prices[0].price.toFixed(2)} to $${prices.at(-1).price.toFixed(2)}, drawn with lines management said on the call` : "Price chart loading"} />
      </div>
      <Marquee history={history} names={names} onOpen={onOpen} />
    </section>

    <section className="m-what" ref={howRef} aria-labelledby="what-title">
      <div className="m-section-head">
        <div><p className="m-eyebrow m-eyebrow-green">What comes back</p><h2 className="m-h2" id="what-title">One call, on one page.</h2></div>
        <p className="m-section-lede">The numbers, the lines that mattered, how the stock moved, and the exact passage behind every claim.</p>
      </div>
      <div className="m-what-stage">
        <Preview report={featured} history={history} names={names} onPick={setFeaturedId} onOpen={onOpen} />
        <span className="m-note m-note-1"><i>1</i>Every claim links<br />to its exact line</span>
        <span className="m-note m-note-2"><i>2</i>↑ How the stock moved after</span>
        <span className="m-note m-note-3"><i>3</i>↑ Tone, labelled honestly</span>
      </div>
    </section>

    <section className="m-instant" aria-labelledby="instant-title">
      <p className="m-eyebrow m-eyebrow-mint">Built to feel instant</p>
      <h2 className="m-h2" id="instant-title">No spinner theatre.</h2>
      <div className="m-feats">
        <div className="m-feat">
          <b>Already read? Opens now.</b>
          <span className="m-feat-list">{(ready.length ? ready.slice(0, 2) : [null, null]).map((item, i) => item ? <button type="button" key={item.report_id} className="m-feat-row" onClick={() => onOpen(item)}><CompanyLogo ticker={item.ticker} size={28} radius={8} />{companyName(item.ticker, names)} {periodLabel(item)}<span className="m-ready">Ready</span></button> : <Skeleton key={i} height={44} radius={12} />)}</span>
          <span className="m-feat-note">{ready.length} {ready.length === 1 ? "call" : "calls"} in the library load with no wait.</span>
        </div>
        <div className="m-feat">
          <b>New call? About 40 seconds.</b>
          <span className="m-feat-steps"><span>✓ Found the transcript</span><span className="is-strong">Reading the passages…</span><span className="m-bar-load"><span /></span><span className="is-muted">Checking every quote · Pulling prices</span></span>
          <span className="m-feat-note">Findings show up as they’re ready. The finished report is saved to the library.</span>
        </div>
        <div className="m-feat">
          <b>Keyboard first.</b>
          <button type="button" className="m-feat-cmd" onClick={onCommand}>
            <span className="m-feat-cmd-q">⌕ <b>{ready[0] ? ready[0].ticker.toLowerCase() : "appl"}</b><Kbd>esc</Kbd></span>
            {(ready.length ? ready.slice(0, 2) : []).map((item, i) => <span key={item.report_id} className={`m-feat-cmd-row ${i === 0 ? "is-on" : ""}`}><CompanyLogo ticker={item.ticker} size={24} radius={6} />{companyName(item.ticker, names)} {periodLabel(item)}{i === 0 && <Kbd>↵</Kbd>}</span>)}
          </button>
          <span className="m-feat-note"><Kbd>{mod === "⌘" ? "⌘K" : "Ctrl K"}</Kbd> anywhere · <Kbd>J</Kbd> <Kbd>K</Kbd> between findings</span>
        </div>
      </div>
    </section>

    <Library history={history} total={total} state={historyState} names={names} onOpen={onOpen} onRetry={onRetry} libraryRef={libraryRef} />
    <SiteFooter />
  </div>;
}

export function SiteFooter() {
  return <footer className="m-footer">
    <div><span className="m-footer-brand">¶ minus the hour</span><span className="m-mono m-footer-src">TRANSCRIPTS: <a href="https://huggingface.co/datasets/defeatbeta/yahoo-finance-data" target="_blank" rel="noreferrer">DEFEATBETA</a> · ANALYSIS: GEMINI · PRICES: YAHOO FINANCE</span></div>
    <p>Tone is the model’s read, not a fact. Not investment advice.<br />Built by <a href="https://meherzad.tech" target="_blank" rel="noreferrer">Meherzad Antia</a> · <a href="https://github.com/MeherzadA/AI-Earnings-Call-Analyzer" target="_blank" rel="noreferrer">GitHub</a></p>
  </footer>;
}
