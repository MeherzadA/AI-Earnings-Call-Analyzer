import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import { companyName, highlightPeriod, markRange, money, moveTone, newsTitle, periodLabel, promiseChart, receiptHash, returnAt, shortDate, shortVersion, signedPct } from "./format.js";
import { CategoryChip, CompanyLogo, Kbd, QuoteRail, Skeleton, Spark, useElementWidth, useReducedMotion, useToast } from "./ui.jsx";
import { AppBar } from "./Landing.jsx";

export function useNarrow(query = "(max-width: 999px)") {
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return narrow;
}

export function Modal({ className = "", label, onClose, children }) {
  const ref = useRef(null);
  // Layout effect: open before the children's effects measure or scroll anything inside.
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  // Esc and backdrop clicks close it. Not the native close event: our own cleanup fires that too.
  return <dialog ref={ref} className={`m-modal ${className}`} aria-label={label} onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>{children}</dialog>;
}

export function FindingCard({ finding, selected, onSelect, onCite, style, cardRef }) {
  return <article ref={cardRef} className={`m-find ${selected ? "is-selected" : ""}`} style={style} tabIndex={0} onClick={() => onSelect?.()} onKeyDown={(event) => {
    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect?.(); }
  }} aria-current={selected ? "true" : undefined}>
    <span className="m-find-top"><CategoryChip category={finding.category} /><span className="m-mono m-find-id">{finding.id}</span></span>
    <h3>{finding.headline}</h3>
    <p>{finding.interpretation || finding.observation}</p>
    <span className="m-find-cites">{finding.citations.map((citation, index) => <button type="button" key={index} className="m-cite" onClick={(event) => { event.stopPropagation(); onCite(citation, index); }} aria-label={`Read passage ${citation.passage_id.slice(1)}, the source for: ${finding.headline}`}>{citation.passage_id} · ✓ word for word</button>)}</span>
  </article>;
}

// The source passage with the cited words highlighted; ‹ › walks to neighbouring passages.
export function SourcePanel({ passages, citation, offset = 0, onOffset, onOpenTranscript, error }) {
  const body = useRef(null);
  const mark = useRef(null);
  const index = passages ? passages.findIndex((item) => item.id === citation.passage_id) : -1;
  const passage = index >= 0 ? passages[Math.max(0, Math.min(passages.length - 1, index + offset))] : null;
  const range = passage && passage.id === citation.passage_id ? markRange(passage, citation) : null;
  useEffect(() => {
    if (!body.current) return;
    body.current.scrollTop = mark.current ? Math.max(0, mark.current.offsetTop - body.current.clientHeight / 3) : 0;
  }, [passage?.id, citation.passage_id, citation.start]);
  return <div className="m-source">
    <div className="m-source-head">
      <span className="m-eyebrow m-eyebrow-mint">Source · passage {(passage?.id || citation.passage_id).slice(1)}{passages ? ` of ${passages.length}` : ""}</span>
      <span className="m-source-nav">
        <button type="button" className="m-kbd m-kbd-dark m-hit" aria-label="Previous passage" disabled={!passage || index + offset <= 0} onClick={() => onOffset(offset - 1)}>‹</button>
        <button type="button" className="m-kbd m-kbd-dark m-hit" aria-label="Next passage" disabled={!passage || index + offset >= passages.length - 1} onClick={() => onOffset(offset + 1)}>›</button>
      </span>
    </div>
    <div className="m-source-body m-mono" ref={body} aria-live="polite">
      {passage ? (range ? <>{passage.text.slice(0, range[0])}<mark ref={mark}>{passage.text.slice(range[0], range[1])}</mark>{passage.text.slice(range[1])}</> : passage.text)
        : error ? <span>{error}</span>
        : <>“<mark ref={mark}>{citation.quote}</mark>”<span className="m-source-skel"><Skeleton height={12} /><Skeleton height={12} width="80%" /></span></>}
    </div>
    <div className="m-source-foot">
      <span className="m-source-ok">{offset === 0 ? "✓ Found word for word" : `${Math.abs(offset)} passage${Math.abs(offset) === 1 ? "" : "s"} ${offset < 0 ? "before" : "after"} the quote`}</span>
      {offset !== 0 && <button type="button" className="m-linkish" onClick={() => onOffset(0)}>Back to the quote</button>}
      {onOpenTranscript && <button type="button" className="m-linkish m-source-open" onClick={() => onOpenTranscript(passage?.id || citation.passage_id)}>Open in transcript →</button>}
    </div>
  </div>;
}

export function AfterCard({ report, prices, onClick, loading }) {
  const next = returnAt(report, prices, 1), fifth = returnAt(report, prices, 5);
  const down = (fifth ?? next ?? 0) < 0;
  return <a className="m-after" href="#stock" onClick={(event) => { event.preventDefault(); onClick?.(); }}>
    <span className="m-after-top"><span className="m-eyebrow">After the call</span><span className="m-mono">{prices.length > 1 ? `${prices.length - 1} trading days ↓` : loading ? "Pulling prices…" : "No prices"}</span></span>
    {prices.length > 1 ? <Spark prices={prices} stroke="#0F3B2C" dot={down ? "#C2321A" : "#1E7A46"} height={80} /> : <Skeleton height={80} radius={12} />}
    <span className="m-after-pair">
      {[["Next day", next], ["5 days", fifth]].map(([label, value]) => <span key={label}><small className="m-mono">{label.toUpperCase()}</small><b className={`m-num m-move-${moveTone(value)}`}>{prices.length > 1 || value != null ? signedPct(value) : "—"}</b></span>)}
    </span>
  </a>;
}

export function TranscriptDrawer({ passages, error, focus, citations, onClose, title }) {
  const ref = useRef(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!passages || !focus) return;
    requestAnimationFrame(() => ref.current?.querySelector(`[data-passage="${focus}"]`)?.scrollIntoView({ block: "start" }));
  }, [passages, focus]);
  const needle = query.trim().toLowerCase();
  const shown = passages && needle ? passages.filter((item) => item.text.toLowerCase().includes(needle)) : passages;
  return <Modal className="m-drawer" label="Call transcript" onClose={onClose}>
    <div className="m-drawer-head">
      <div><p className="m-eyebrow">Transcript</p><h2>{title}</h2></div>
      <button type="button" className="m-close m-hit" onClick={onClose} aria-label="Close transcript">×</button>
    </div>
    <label className="m-drawer-search"><span className="sr-only">Search the transcript</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the transcript" /></label>
    <div className="m-drawer-body" ref={ref}>
      {!passages && !error && Array.from({ length: 6 }, (_, i) => <div key={i} className="m-tpassage"><Skeleton width={40} height={12} /><Skeleton height={12} /><Skeleton height={12} /><Skeleton width="70%" height={12} /></div>)}
      {error && <p role="alert">{error}</p>}
      {shown?.map((passage) => {
        const cite = citations.find((item) => item.passage_id === passage.id);
        const range = cite ? markRange(passage, cite) : null;
        return <section key={passage.id} data-passage={passage.id} className={`m-tpassage ${passage.id === focus ? "is-focus" : ""}`}>
          <h3 className="m-mono">{passage.id}{cite ? " · cited" : ""}</h3>
          <p>{range ? <>{passage.text.slice(0, range[0])}<mark>{passage.text.slice(range[0], range[1])}</mark>{passage.text.slice(range[1])}</> : passage.text}</p>
        </section>;
      })}
      {shown && !shown.length && <p className="m-muted">No passage mentions “{query}”.</p>}
    </div>
    <p className="m-drawer-foot">Original saved transcript. Passage numbers are generated by this app.</p>
  </Modal>;
}

function PromiseChart({ chart, report }) {
  const [wrap, width] = useElementWidth(1000);
  const narrow = width < 640;
  const left = 4, right = width - (narrow ? 8 : 120);
  const x = (value) => left + (value - chart.min) / (chart.max - chart.min) * (right - left);
  const { prior, next } = chart;
  const rows = [prior && "prior", next && "next"].filter(Boolean);
  const height = rows.length * 104 + 40;
  const previous = report.context?.previous_call;
  const label = [prior && `Q${report.quarter} outlook range ${money(prior.low)} to ${money(prior.high)}${prior.actual ? `, actual ${money(prior.actual)}` : ""}.`, next && `Next-quarter outlook range ${money(next.low)} to ${money(next.high)}, not yet reported.`].filter(Boolean).join(" ");
  return <div ref={wrap} className="m-promise-chart">
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {chart.ticks.map((tick) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={10} y2={height - 34} stroke="rgba(255,248,236,.08)" /><text x={x(tick)} y={height - 10} textAnchor="middle" className="m-mono" fontSize="12" fill="rgba(255,248,236,.78)">{money(tick)}</text></g>)}
      {rows.map((row, i) => {
        const top = 20 + i * 104;
        if (row === "prior") {
          const end = prior.actual != null ? x(prior.actual) : null;
          const delta = prior.actual == null ? "" : prior.actual > prior.high ? `+${money(prior.actual - prior.high)} above the top` : prior.actual < prior.low ? `−${money(prior.low - prior.actual)} below the bottom` : "inside the range";
          const labelRight = end != null && end < width - 200;
          return <g key={row} className="m-promise-row">
            <text x="0" y={top + 6} className="m-mono" fontSize="12" letterSpacing="1" fill="rgba(255,248,236,.78)">{`${periodLabel(report)} · PROMISED ON THE ${previous ? `Q${previous.quarter}` : "PREVIOUS"} CALL`}</text>
            <rect x={x(prior.low)} y={top + 20} width={Math.max(6, x(prior.high) - x(prior.low))} height="36" rx="10" fill="rgba(182,245,201,.22)" stroke="#B6F5C9" strokeWidth="1.5" className="m-grow-x" />
            {!narrow && <text x={(x(prior.low) + x(prior.high)) / 2} y={top + 43} textAnchor="middle" className="m-mono" fontSize="13" fontWeight="700" fill="#B6F5C9">{`${money(prior.low).replace(/[BMT]$/, "")}–${money(prior.high).slice(1)}`}</text>}
            {end != null && <>
              <line x1={prior.actual > prior.high ? x(prior.high) : prior.actual < prior.low ? x(prior.low) : end} x2={end} y1={top + 38} y2={top + 38} stroke="#FFF8EC" strokeWidth="2" strokeDasharray="3 4" />
              <circle cx={end} cy={top + 38} r="11" fill="#FFF8EC" className="m-pop-in" />
              <text x={labelRight ? end + 20 : end - 20} y={top + 34} textAnchor={labelRight ? "start" : "end"} fontSize={narrow ? 15 : 20} fontWeight="800" fill="#FFF8EC">{money(prior.actual)} reported</text>
              <text x={labelRight ? end + 20 : end - 20} y={top + 54} textAnchor={labelRight ? "start" : "end"} className="m-mono" fontSize="12" fill="#B6F5C9">{delta} · {report.context.comparison.reported?.citations?.[0]?.passage_id || ""}</text>
            </>}
          </g>;
        }
        return <g key={row}>
          <text x="0" y={top + 6} className="m-mono" fontSize="12" letterSpacing="1" fill="rgba(255,248,236,.78)">{`NEXT QUARTER · PROMISED ON THIS CALL`}</text>
          <rect x={x(next.low)} y={top + 20} width={Math.max(6, x(next.high) - x(next.low))} height="36" rx="10" fill="none" stroke="#FFF8EC" strokeOpacity=".6" strokeWidth="1.5" strokeDasharray="5 5" />
          {!narrow && <text x={(x(next.low) + x(next.high)) / 2} y={top + 43} textAnchor="middle" className="m-mono" fontSize="13" fontWeight="700" fill="#FFF8EC">{`${money(next.low).replace(/[BMT]$/, "")}–${money(next.high).slice(1)}`}</text>}
          {!narrow && x(next.low) > 330 && <text x={x(next.low) - 12} y={top + 43} textAnchor="end" className="m-mono" fontSize="12" fill="rgba(255,248,236,.55)">checked when that call is read →</text>}
        </g>;
      })}
    </svg>
    {narrow && <ul className="m-promise-legend m-mono">
      {prior && <li>Promised: {money(prior.low)}–{money(prior.high)}{prior.actual != null && <> · Reported: <b>{money(prior.actual)}</b></>}</li>}
      {next && <li>Next quarter: {money(next.low)}–{money(next.high)}, checked when that call is read</li>}
    </ul>}
  </div>;
}

const SECTIONS = [["findings", "Findings"], ["numbers", "Numbers"], ["promise", "Promise vs. delivery"], ["stock", "Stock"], ["headlines", "Headlines"]];

export default function Report({ report: initial, history, names, onOpen, onHome, onCommand, initialPassage }) {
  const toast = useToast();
  const narrow = useNarrow();
  const reduced = useReducedMotion();
  const [report, setReport] = useState(initial);
  const [transcript, setTranscript] = useState({ passages: null, error: "" });
  const [contextState, setContextState] = useState(initial.context ? "ready" : "loading");
  const [priceState, setPriceState] = useState("idle");
  const [selected, setSelected] = useState(0);
  const [cite, setCite] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sheet, setSheet] = useState(null);
  const [drawer, setDrawer] = useState(initialPassage ? { focus: initialPassage } : null);
  const [section, setSection] = useState("findings");
  const cards = useRef([]);
  const stockRef = useRef(null);
  const research = report.research;
  const findings = useMemo(() => research.findings.filter((item) => item.citations?.length), [research]);
  const highlights = research.financial_highlights.filter((item) => item.citations?.length);
  const prices = report.daily_prices || [];
  const name = companyName(report.ticker, names);
  const finding = findings[selected];
  const citation = finding?.citations[Math.min(cite, finding.citations.length - 1)];
  const siblings = history.filter((item) => item.ticker === report.ticker && item.has_research).sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  const allCitations = useMemo(() => [...findings.flatMap((item) => item.citations), ...highlights.flatMap((item) => item.citations)], [findings, highlights]);
  const smooth = reduced ? "auto" : "smooth";

  useEffect(() => {
    let cancelled = false;
    apiRequest(`/reports/${report.report_id}/transcript`, { timeoutMs: 90000 }).then((data) => {
      if (cancelled) return;
      if (research.source_hash && data.source_hash !== research.source_hash) setTranscript({ passages: null, error: "This transcript no longer matches the report’s source. Run a new analysis before relying on these citations." });
      else setTranscript({ passages: data.passages, error: "" });
    }).catch((error) => { if (!cancelled) setTranscript({ passages: null, error: error.message }); });
    return () => { cancelled = true; };
  }, [report.report_id]);

  useEffect(() => {
    if (report.context?.comparison && report.context?.news) return;
    let cancelled = false;
    setContextState("loading");
    apiRequest(`/reports/${report.report_id}/context`, { method: "POST", timeoutMs: 90000 }).then((data) => {
      if (!cancelled) { setReport((current) => ({ ...current, context: data.context })); setContextState("ready"); }
    }).catch(() => { if (!cancelled) setContextState("error"); });
    return () => { cancelled = true; };
  }, [report.report_id]);

  // A longer price window is fetched once the stock section comes near the viewport.
  useEffect(() => {
    if (prices.length >= 22 || priceState !== "idle" || !stockRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      setPriceState("loading");
      apiRequest(`/reports/${report.report_id}/prices`, { method: "POST", timeoutMs: 60000 }).then((data) => {
        setReport((current) => ({ ...current, daily_prices: data.daily_prices, return_1day: data.return_1day, return_5day: data.return_5day }));
        setPriceState("done");
      }).catch(() => setPriceState("error"));
    }, { rootMargin: "400px" });
    observer.observe(stockRef.current);
    return () => observer.disconnect();
  }, [report.report_id, prices.length, priceState]);

  useEffect(() => {
    // The current section is the last one whose top has passed just under the sticky tabs.
    let frame = 0;
    function update() {
      frame = 0;
      const line = (document.querySelector(".m-tabs")?.getBoundingClientRect().bottom || 136) + 32;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = SECTIONS[0][0];
      for (const [id] of SECTIONS) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top != null && (top <= line || (atEnd && top < window.innerHeight))) current = id;
      }
      setSection(current);
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);

  const select = useCallback((index, scroll = false) => {
    setSelected(index); setCite(0); setOffset(0);
    if (scroll) cards.current[index]?.scrollIntoView({ block: "nearest", behavior: smooth });
  }, [smooth]);

  useEffect(() => {
    function onKey(event) {
      if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || document.querySelector("dialog[open]")) return;
      const key = event.key.toLowerCase();
      if (key === "j" || key === "k") {
        event.preventDefault();
        select(Math.max(0, Math.min(findings.length - 1, selected + (key === "j" ? 1 : -1))), true);
      }
      if (key === "t") { event.preventDefault(); setDrawer({ focus: citation?.passage_id }); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, findings.length, citation, select]);

  const goTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: smooth, block: "start" });
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); toast("Link copied"); }
    catch { toast("Couldn’t copy. The address bar has the link.", "warn"); }
  }
  const openCite = (findingIndex, citeIndex, item) => {
    if (findingIndex != null) { setSelected(findingIndex); setCite(citeIndex); setOffset(0); }
    if (narrow || findingIndex == null) setSheet({ citation: item, offset: 0 });
  };

  const version = shortVersion(report);
  const chart = report.context ? promiseChart(report) : null;
  const comparison = report.context?.comparison;
  const news = report.context?.news;
  const checks = research.checks;
  const fiscalNote = report.call_date && Number(report.call_date.slice(0, 4)) !== Number(report.year);

  return <div className="m-report">
    <AppBar variant="report" onHome={onHome} onCommand={onCommand} onLibrary={() => onHome("library")} />
    <section className="m-rhero">
      <p className="m-crumb m-mono"><a href="?" onClick={(event) => { event.preventDefault(); onHome("library"); }}>Library</a> / {name} / {periodLabel(report)}</p>
      <div className="m-rhero-top">
        <CompanyLogo ticker={report.ticker} size={76} radius={20} className="m-rhero-logo" alt={name} />
        <div className="m-rhero-title">
          <h1 tabIndex={-1} id="report-title">{name} <span>{periodLabel(report)}</span></h1>
          <span className="m-mono m-rhero-sub">{report.ticker} · call on {shortDate(report.call_date)}{fiscalNote ? ` · fiscal Q${report.quarter} ${report.year}` : ""} · {transcript.passages ? `${transcript.passages.length} passages` : "… passages"}</span>
        </div>
        <div className="m-rhero-actions">
          {siblings.length > 1 && <nav className="m-qswitch" aria-label={`Other ${name} calls`}>{siblings.map((item) => <button type="button" key={item.report_id} aria-current={item.report_id === report.report_id ? "page" : undefined} onClick={() => item.report_id !== report.report_id && onOpen(item)}>{periodLabel(item)}</button>)}</nav>}
          <div className="m-rhero-btns">
            <button type="button" className="m-btn m-btn-ghost" onClick={copyLink}>Copy link</button>
            <button type="button" className="m-btn m-btn-mint" onClick={() => setDrawer({ focus: citation?.passage_id })}>Read the transcript</button>
          </div>
        </div>
      </div>
      <div className="m-rhero-grid">
        <div>
          <p className="m-eyebrow m-eyebrow-mint">The short version</p>
          {version ? <p className="m-short">{version.before}{version.mark && <span>{version.mark}</span>}{version.after}</p> : <Skeleton height={48} />}
          {contextState === "loading" && !report.context && <p className="m-short-note m-mono">Checking last quarter’s promise…</p>}
          <div className="m-chipds">
            <span className="m-chipd"><span className={`m-tone-dot m-tone-${research.management_tone}`} />Tone: {research.management_tone} <span className="m-chipd-dim">· the model’s read</span></span>
            <span className="m-chipd">{findings.length} findings · {highlights.length} numbers</span>
            {checks && <span className="m-chipd m-chipd-mint">✓ Every quote found word for word</span>}
          </div>
        </div>
        <AfterCard report={report} prices={prices} loading={priceState === "loading"} onClick={() => goTo("stock")} />
      </div>
    </section>

    <nav className="m-tabs" aria-label="Report sections">
      <div className="m-tabs-scroll">
        {SECTIONS.map(([id, label]) => {
          const count = id === "findings" ? findings.length : id === "numbers" ? highlights.length : id === "headlines" ? news?.items?.length : null;
          return <a key={id} href={`#${id}`} aria-current={section === id ? "true" : undefined} onClick={(event) => { event.preventDefault(); goTo(id); }}>{label}{count ? <span>{count}</span> : null}</a>;
        })}
        <a href="#transcript" onClick={(event) => { event.preventDefault(); setDrawer({ focus: citation?.passage_id }); }}>Transcript{transcript.passages && <span>{transcript.passages.length}</span>}</a>
      </div>
      <span className="m-tabs-hint"><Kbd>J</Kbd><Kbd>K</Kbd> move between findings</span>
    </nav>

    <section className="m-findings" id="findings" aria-labelledby="findings-title">
      <div className="m-findings-list">
        <p className="m-eyebrow m-eyebrow-green">What mattered</p>
        <h2 className="m-h2-r" id="findings-title">{findings.length === 1 ? "One finding" : `${["Zero", "One", "Two", "Three", "Four", "Five", "Six"][findings.length] || findings.length} findings`}, each with its line.</h2>
        {findings.map((item, index) => <FindingCard key={item.id} finding={item} selected={index === selected} cardRef={(node) => { cards.current[index] = node; }}
          onSelect={() => narrow ? openCite(index, 0, item.citations[0]) : select(index)} onCite={(c, i) => openCite(index, i, c)} style={{ "--i": index }} />)}
        {!findings.some((item) => item.category === "risks") && <p className="m-muted">No risk finding was kept. That doesn’t mean the call had none; this isn’t a complete risk assessment.</p>}
      </div>
      <aside className="m-findings-aside" aria-label="Source passage">
        {citation && !narrow && <SourcePanel passages={transcript.passages} citation={citation} offset={offset} onOffset={setOffset} error={transcript.error} onOpenTranscript={(focus) => setDrawer({ focus })} />}
        <div className="m-checks">
          <b>How these were checked</b>
          {checks ? `${checks.findings_retained} of ${checks.findings_checked} findings and ${checks.highlights_retained} of ${checks.highlights_checked} numbers kept after matching against the transcript. ${checks.human_review === "not_reviewed" ? "Not reviewed by a person. " : ""}A matching quote shows it was said, not that the reading of it is right.` : "Each quote was matched against the saved transcript. A matching quote shows it was said, not that the reading of it is right."}
        </div>
      </aside>
    </section>

    <section className="m-numbers" id="numbers" aria-labelledby="numbers-title">
      <p className="m-eyebrow m-eyebrow-green">The numbers they gave</p>
      <h2 className="m-h2-r" id="numbers-title">{highlights.length ? `${["No", "One figure", "Two figures", "Three figures", "Four figures"][highlights.length] || `${highlights.length} figures`}, straight from the call.` : "No figures passed the checks."}</h2>
      <div className="m-tiles">
        {highlights.map((metric) => {
          const period = highlightPeriod(research, metric);
          return <div className="m-tile" key={metric.id}>
            <span className="m-eyebrow">{metric.label}</span>
            <b>{metric.value}</b>
            <p className="m-mono">“{metric.citations[0].quote.length > 120 ? `${metric.citations[0].quote.slice(0, 118).replace(/\s+\S*$/, "")}…` : metric.citations[0].quote}”</p>
            <span className="m-tile-foot">
              <button type="button" className="m-cite m-hit" onClick={() => openCite(null, 0, metric.citations[0])} aria-label={`Read passage ${metric.citations[0].passage_id.slice(1)}, the source for ${metric.label}`}>{metric.citations[0].passage_id} ✓</button>
              {period && <span className={`m-period ${period === "unconfirmed" ? "is-warn" : ""}`}>{period === "unconfirmed" ? "Period not confirmed" : "This quarter"}</span>}
            </span>
          </div>;
        })}
      </div>
    </section>

    <section className="m-promise-wrap" id="promise" aria-labelledby="promise-title">
      <div className="m-promise">
        <p className="m-eyebrow m-eyebrow-mint">Promise vs. delivery</p>
        <div className="m-promise-head">
          <h2 className="m-h2-r" id="promise-title">Did they hit what they said they would?</h2>
          {comparison?.outlook?.quote && <p>Last call, management said: <span className="m-mono m-cream">“{comparison.outlook.quote}”</span> <span className="m-mono m-mint m-small">{report.context.previous_call ? `Q${report.context.previous_call.quarter} FY${String(report.context.previous_call.year).slice(-2)}` : ""} · {comparison.outlook.passage_id}</span></p>}
        </div>
        {!report.context && contextState === "loading" && <div className="m-promise-skel"><Skeleton height={36} width="40%" radius={10} /><Skeleton height={36} width="55%" radius={10} /></div>}
        {!report.context && contextState === "error" && <p className="m-promise-msg">Last quarter’s outlook couldn’t be loaded right now. The rest of the report is unaffected.</p>}
        {chart && <PromiseChart chart={chart} report={report} />}
        {report.context && !chart?.prior && comparison?.status !== "compared" && <p className="m-promise-msg">{comparison?.status === "directional" ? comparison.message : comparison?.message || "No fair forecast-to-result comparison is available for this call."}</p>}
        {report.context?.additional_comparisons?.length > 0 && <ul className="m-also">{report.context.additional_comparisons.map((item) => <li key={item.metric}><b>{item.headline}</b><span className="m-mono">Expected {item.expected.toLowerCase()} · reported {item.reported?.value}</span></li>)}</ul>}
        <p className="m-promise-foot">{comparison?.limitation || "Compares stated, possibly rounded figures."} This is management’s own outlook, not analyst consensus.</p>
      </div>
    </section>

    <section className="m-stock" id="stock" ref={stockRef} aria-labelledby="stock-title">
      <p className="m-eyebrow m-eyebrow-green">Stock price after the call</p>
      <div className="m-stock-head">
        <h2 className="m-h2-r" id="stock-title">{prices.length > 1 ? `${prices.length - 1} trading ${prices.length === 2 ? "day" : "days"} after the call.` : "Prices after the call."}</h2>
        <span className="m-muted">Shown side by side, not as cause and effect.</span>
      </div>
      <div className="m-stock-card">
        {prices.length > 1 ? <QuoteRail prices={prices} height={narrow ? 300 : 420} label={`${report.ticker} closing prices for ${prices.length - 1} trading days after the ${periodLabel(report)} call, from $${prices[0].price.toFixed(2)} to $${prices.at(-1).price.toFixed(2)}.`} />
          : <p className="m-stock-empty">Closing prices aren’t available for this call. The transcript and findings still are.</p>}
        {priceState === "loading" && <p className="m-stock-status m-mono" role="status">Pulling up to 21 trading days…</p>}
        <div className="m-stock-tiles">
          {[["Call day", null], ["Next day", 1], ["5 days", 5], ["21 days", 21]].map(([label, session]) => {
            const value = session ? returnAt(report, prices, session) : null;
            const missing = session && prices.length <= session && value == null;
            return <span key={label} className={session === 5 ? "is-key" : ""}><small className="m-eyebrow">{label}</small><b className={`m-mono ${session ? `m-move-${moveTone(value)}-ink` : ""}`}>{session ? (missing ? "—" : signedPct(value)) : prices[0] ? `$${prices[0].price.toFixed(2)}` : "—"}</b></span>;
          })}
        </div>
        <p className="m-stock-foot">Regular-session daily closes from Yahoo Finance. After-hours and intraday moves aren’t shown.</p>
      </div>
    </section>

    <section className="m-headlines" id="headlines" aria-labelledby="headlines-title">
      <div className="m-section-head m-section-head-tight">
        <div><p className="m-eyebrow m-eyebrow-green">Headlines around the call</p><h2 className="m-h2-r" id="headlines-title">{news?.end ? `What the news said up to ${shortDate(news.end, false)}.` : "What the news said."}</h2></div>
        <span className="m-muted m-headlines-note">Links only. We didn’t read or verify these articles, and same-day stories may be from after the call.</span>
      </div>
      <div className="m-news-list">
        {!news && contextState === "loading" && Array.from({ length: 4 }, (_, i) => <div key={i} className="m-news is-skeleton"><Skeleton width={110} height={12} /><Skeleton height={16} /><Skeleton width={80} height={12} /></div>)}
        {news?.items?.map((item) => <a key={item.url} className="m-news" href={item.url} target="_blank" rel="noreferrer"><span className="m-mono m-news-src">{item.source}</span><span className="m-news-title">{newsTitle(item)}</span><span className="m-mono m-news-date">{shortDate(item.published_at)}</span><span aria-hidden="true" className="m-news-arrow">↗</span></a>)}
        {news && !news.items?.length && <p className="m-muted m-news-empty">{news.message || "No matching headlines were found for the two weeks before the call."}</p>}
        {!news && contextState === "error" && <p className="m-muted m-news-empty">Headlines couldn’t be loaded right now.</p>}
      </div>
    </section>

    <footer className="m-receipt">
      <span className="m-mono">READ BY {research.model || "—"} · PROMPT {research.prompt_version || "—"} · {research.generated_at ? shortDate(research.generated_at).toUpperCase() : "—"} · TRANSCRIPT {receiptHash(research.source_hash)}</span>
      <span>Tone is the model’s read, not a fact. Not investment advice.</span>
    </footer>

    {sheet && <Modal className="m-sheet" label="Source passage" onClose={() => setSheet(null)}>
      <button type="button" className="m-close m-sheet-close m-hit" onClick={() => setSheet(null)} aria-label="Close source">×</button>
      <SourcePanel passages={transcript.passages} citation={sheet.citation} offset={sheet.offset} onOffset={(value) => setSheet((current) => ({ ...current, offset: value }))} error={transcript.error} onOpenTranscript={(focus) => { setSheet(null); setDrawer({ focus }); }} />
    </Modal>}
    {drawer && <TranscriptDrawer passages={transcript.passages} error={transcript.error} focus={drawer.focus} citations={allCitations} title={`${name} ${periodLabel(report)}`} onClose={() => setDrawer(null)} />}
  </div>;
}
