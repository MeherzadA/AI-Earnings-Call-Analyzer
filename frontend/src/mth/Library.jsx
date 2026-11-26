import { useMemo, useState } from "react";
import { companyKey, companyName, moveTone, periodLabel, shortDate, signedPct } from "./format.js";
import { CompanyLogo, Skeleton } from "./ui.jsx";
import { AppBar, SiteFooter } from "./Landing.jsx";

const SORTS = {
  recent: { label: "Latest call", order: (a, b) => b.latest - a.latest },
  name: { label: "Company A–Z", order: (a, b) => a.name.localeCompare(b.name) },
  count: { label: "Most reports", order: (a, b) => b.items.length - a.items.length || b.latest - a.latest },
};

const callTime = (item) => (item.call_date ? Date.parse(item.call_date.slice(0, 10)) : 0) || item.year * 10 + item.quarter;

// Every saved report, one block per company, newest quarter first.
export default function LibraryPage({ history, total, state, names, company, onCompany, onOpen, onHome, onCommand, onRetry }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const ready = history.filter((item) => item.has_research);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const byTicker = new Map();
    for (const item of ready) {
      const key = companyKey(item.ticker);
      if (company && key !== companyKey(company)) continue;
      const name = companyName(item.ticker, names);
      if (needle && !`${item.ticker} ${name} ${periodLabel(item)} ${item.year}`.toLowerCase().includes(needle)) continue;
      if (!byTicker.has(key)) byTicker.set(key, { ticker: key, name, items: [], latest: 0 });
      const group = byTicker.get(key);
      group.items.push(item);
      group.latest = Math.max(group.latest, callTime(item));
    }
    const list = [...byTicker.values()];
    for (const group of list) group.items.sort((a, b) => b.year - a.year || b.quarter - a.quarter);
    return list.sort(SORTS[sort].order);
  }, [ready, company, query, sort, names]);

  const companyCount = new Set(ready.map((item) => companyKey(item.ticker))).size;
  const title = company ? companyName(company, names) : "Library";

  return <div className="m-libpage">
    <AppBar variant="light" current="library" onHome={onHome} onCommand={onCommand} onLibrary={() => onHome("library")} />
    <header className="m-libpage-head">
      <nav className="m-crumbs" aria-label="Breadcrumb">
        <a href="?" onClick={(event) => { event.preventDefault(); onHome(); }}>Home</a>
        <span aria-hidden="true">/</span>
        {company ? <a href="?view=library" onClick={(event) => { event.preventDefault(); onHome("library"); }}>Library</a> : <span aria-current="page">Library</span>}
        {company && <><span aria-hidden="true">/</span><span aria-current="page">{title}</span></>}
      </nav>
      <div className="m-libpage-title">
        {company && <CompanyLogo ticker={company} size={48} radius={12} />}
        <h1 id="library-title" tabIndex={-1}>{title}</h1>
      </div>
      <p className="m-libpage-sub">
        {company ? `${groups[0]?.items.length ?? 0} saved ${groups[0]?.items.length === 1 ? "report" : "reports"}. Search for ${title} to analyze another quarter.`
          : `${ready.length} saved reports across ${companyCount} companies. Each opens right away.`}
      </p>
      <div className="m-libpage-tools">
        <label className="m-libpage-filter"><span className="sr-only">Filter reports</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={company ? "Filter by quarter or year" : "Filter by company, ticker or year"} />
        </label>
        {!company && <label className="m-libpage-sort">Sort by
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            {Object.entries(SORTS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
          </select>
        </label>}
        <button type="button" className="m-libpage-new" onClick={onCommand}>Analyze a new call</button>
      </div>
    </header>

    <section className="m-libpage-body" aria-labelledby="library-title">
      {state === "error" && <p className="m-libpage-status" role="alert">The library couldn’t load. <button type="button" onClick={onRetry}>Try again</button></p>}
      {state === "loading" && !ready.length && Array.from({ length: 3 }, (_, i) => <div className="m-libgroup" key={i}><Skeleton width={200} height={20} /><div className="m-libgroup-grid">{[0, 1, 2].map((j) => <Skeleton key={j} height={64} radius={6} />)}</div></div>)}
      {groups.map((group) => <div className="m-libgroup" key={group.ticker}>
        {!company && <div className="m-libgroup-head">
          <CompanyLogo ticker={group.ticker} size={32} radius={8} />
          <a href={`?view=library&company=${group.ticker}`} onClick={(event) => { event.preventDefault(); onCompany(group.ticker); }}><b>{group.name}</b></a>
          <span>{group.ticker} · {group.items.length} {group.items.length === 1 ? "report" : "reports"}</span>
        </div>}
        <div className="m-libgroup-grid">
          {group.items.map((item) => <a key={item.report_id} className="m-libcard" href={`?report=${item.report_id}`} onClick={(event) => { event.preventDefault(); onOpen(item); }}>
            <span className="m-libcard-period">{periodLabel(item)}</span>
            <span className="m-libcard-date">Call on {shortDate(item.call_date)}</span>
            <span className={`m-libcard-move is-${moveTone(item.return_1day)}`} title="Next-day close vs. call-day close">
              {item.return_1day == null ? "No price data" : `${signedPct(item.return_1day)} next day`}
            </span>
          </a>)}
        </div>
      </div>)}
      {state === "ready" && !groups.length && <p className="m-libpage-status">{ready.length ? "No saved reports match that filter." : "No saved reports yet. Search for a company to analyze its first call."}</p>}
      {total > ready.length && <p className="m-libpage-status">Showing the {ready.length} most recent of {total} reports.</p>}
    </section>
    <SiteFooter />
  </div>;
}
