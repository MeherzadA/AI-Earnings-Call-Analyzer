import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import { companyName, filterLibrary, periodLabel, samePeriod, shortDate } from "./format.js";
import { CompanyLogo, Kbd, Skeleton } from "./ui.jsx";
import { Modal } from "./Report.jsx";

// ⌘K: open anything in the library, or pick any company and quarter to read.
export default function CommandMenu({ history, names, onNames, onOpen, onAnalyze, onClose, actions = [] }) {
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState(null);
  const [periods, setPeriods] = useState(null);
  const [active, setActive] = useState(0);
  const list = useRef(null);
  const needle = query.trim();

  useEffect(() => {
    if (company || !needle) { setCompanies([]); return; }
    let cancelled = false;
    setCompanies(null);
    const timer = setTimeout(() => apiRequest(`/transcripts/search?q=${encodeURIComponent(needle)}`, { timeoutMs: 15000 }).then((data) => {
      if (cancelled) return;
      setCompanies(data.companies || []);
      onNames(Object.fromEntries((data.companies || []).map((item) => [item.symbol, item.name])));
    }).catch(() => !cancelled && setCompanies([])), 160);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [needle, company]);

  useEffect(() => {
    if (!company) return;
    let cancelled = false;
    setPeriods(null);
    apiRequest(`/transcripts/${encodeURIComponent(company.symbol)}/periods`, { timeoutMs: 15000 }).then((data) => {
      if (!cancelled) setPeriods((data.periods || []).filter((item) => !item.call_date || item.call_date.slice(0, 10) <= new Date().toISOString().slice(0, 10)).sort((a, b) => b.year - a.year || b.quarter - a.quarter).map((item) => ({ ...item, ticker: company.symbol })));
    }).catch(() => !cancelled && setPeriods([]));
    return () => { cancelled = true; };
  }, [company?.symbol]);

  const ready = history.filter((item) => item.has_research);
  let items;
  if (company) {
    const filtered = (periods || []).filter((item) => !needle || periodLabel(item).toLowerCase().includes(needle.toLowerCase()) || String(item.year).includes(needle));
    items = filtered.slice(0, 12).map((item) => {
      const saved = ready.find((report) => samePeriod(report, item));
      return { key: `${item.year}-${item.quarter}`, ticker: item.ticker, title: `${companyName(item.ticker, names)} ${periodLabel(item)}`, meta: item.call_date ? `Call on ${shortDate(item.call_date)}` : "", badge: saved ? "Ready" : "Analyze", run: () => saved ? onOpen(saved) : onAnalyze({ ticker: item.ticker, year: Number(item.year), quarter: Number(item.quarter) }) };
    });
  } else {
    const library = filterLibrary(ready, "all", needle, names).slice(0, needle ? 6 : 8).map((item) => ({ key: `r${item.report_id}`, ticker: item.ticker, title: `${companyName(item.ticker, names)} ${periodLabel(item)}`, meta: shortDate(item.call_date), badge: "Ready", run: () => onOpen(item), group: "In the library" }));
    const found = (companies || []).map((item) => ({ key: `c${item.symbol}`, ticker: item.symbol, title: item.name, meta: item.symbol, badge: "Pick a quarter →", run: () => { setCompany(item); setQuery(""); setActive(0); }, keep: true, group: "Any company" }));
    const commands = needle ? [] : actions.map((action) => ({ ...action, group: "Actions" }));
    items = [...library, ...found, ...commands];
  }
  const current = items[Math.min(active, items.length - 1)];

  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [active]);

  function onKeyDown(event) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    if (event.key === "Enter" && current) { event.preventDefault(); run(current); }
    if (event.key === "Backspace" && !query && company) { setCompany(null); setPeriods(null); setActive(0); }
  }
  function run(item) { item.run(); if (!item.keep) onClose(); }

  let lastGroup = null;
  return <Modal className="m-cmd" label="Search calls" onClose={onClose}>
    <div className="m-cmd-input">
      <span aria-hidden="true">⌕</span>
      {company && <button type="button" className="m-cmd-scope" onClick={() => { setCompany(null); setPeriods(null); }} aria-label={`Remove ${company.symbol} filter`}>{company.symbol} ×</button>}
      <input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={onKeyDown} placeholder={company ? "Filter quarters" : "Company, ticker or quarter"}
        role="combobox" aria-expanded="true" aria-controls="m-cmd-list" aria-activedescendant={current ? `m-cmd-${current.key}` : undefined} spellCheck={false} autoComplete="off" />
      <Kbd>esc</Kbd>
    </div>
    <div className="m-cmd-list" id="m-cmd-list" role="listbox" ref={list} aria-label="Results">
      {company && !periods && [0, 1, 2].map((i) => <div key={i} className="m-cmd-row"><Skeleton width={24} height={24} radius={6} /><Skeleton width="50%" height={14} /></div>)}
      {items.map((item, index) => {
        const header = item.group && item.group !== lastGroup ? <p className="m-cmd-group" key={`g-${item.group}`}>{item.group}</p> : null;
        lastGroup = item.group;
        return [header, <div role="option" id={`m-cmd-${item.key}`} key={item.key} aria-selected={index === active} className="m-cmd-row" onMouseMove={() => setActive(index)} onClick={() => run(item)}>
          {item.ticker ? <CompanyLogo ticker={item.ticker} size={24} radius={6} /> : <span className="m-cmd-icon" aria-hidden="true">{item.icon || "→"}</span>}
          <span className="m-cmd-title">{item.title}<small>{item.meta}</small></span>
          {item.badge && <span className={`m-cmd-badge ${item.badge === "Ready" ? "is-ready" : ""}`}>{item.badge}</span>}
          {index === active && <Kbd>↵</Kbd>}
        </div>];
      })}
      {!items.length && (company ? periods : true) && <p className="m-cmd-empty">{company ? (periods.length ? `No ${company.symbol} quarter matches “${needle}”.` : `No past calls found for ${company.symbol}.`) : needle ? (companies === null ? "Searching the transcript archive…" : `Nothing matches “${needle}”.`) : "The library is empty. Type a company to read its call."}</p>}
    </div>
    <div className="m-cmd-foot m-mono"><span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span><span><Kbd>↵</Kbd> open</span>{company && <span><Kbd>⌫</Kbd> all companies</span>}</div>
  </Modal>;
}
