import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, streamAnalysis } from "../api.js";
import { reportIdFromSearch } from "../reportNavigation.js";
import { companyName, periodLabel, samePeriod } from "./format.js";
import { Skeleton, ToastProvider, useToast, withTransition } from "./ui.jsx";
import Landing, { AppBar, SiteFooter } from "./Landing.jsx";
import Report from "./Report.jsx";
import Analyzing from "./Analyzing.jsx";
import CommandMenu from "./Command.jsx";

function ReportSkeleton({ onHome, onCommand }) {
  return <div className="m-report" aria-busy="true">
    <AppBar variant="report" onHome={onHome} onCommand={onCommand} onLibrary={() => onHome("library")} />
    <section className="m-rhero" role="status" aria-label="Opening the report">
      <Skeleton width={180} height={12} className="m-skel-dark" />
      <div className="m-rhero-top"><Skeleton width={76} height={76} radius={20} className="m-skel-dark" /><div className="m-rhero-title"><Skeleton width={340} height={52} className="m-skel-dark" /><Skeleton width={260} height={14} className="m-skel-dark" /></div></div>
      <div className="m-rhero-grid"><div><Skeleton width={160} height={12} className="m-skel-dark" /><Skeleton height={44} className="m-skel-dark" style={{ marginTop: 14 }} /><Skeleton height={44} width="70%" className="m-skel-dark" style={{ marginTop: 10 }} /></div><div className="m-after is-skeleton"><Skeleton height={14} width="50%" /><Skeleton height={80} radius={12} /><Skeleton height={56} radius={14} /></div></div>
    </section>
    <section className="m-findings"><div className="m-findings-list">{[0, 1, 2].map((i) => <div key={i} className="m-find is-skeleton"><Skeleton width={96} height={22} radius={999} /><Skeleton height={22} width="80%" /><Skeleton height={14} /></div>)}</div><aside className="m-findings-aside"><div className="m-source m-source-wait"><Skeleton height={12} width="40%" className="m-skel-dark" /><Skeleton height={12} className="m-skel-dark" /><Skeleton height={12} className="m-skel-dark" /></div></aside></section>
  </div>;
}

function ErrorView({ message, onHome, onRetry, onCommand }) {
  return <div className="m-report">
    <AppBar variant="report" onHome={onHome} onCommand={onCommand} onLibrary={() => onHome("library")} />
    <section className="m-rhero m-rhero-error" role="alert">
      <p className="m-eyebrow m-eyebrow-mint">Couldn’t open that</p>
      <p className="m-short">{message}</p>
      <div className="m-rhero-btns">{onRetry && <button type="button" className="m-btn m-btn-mint" onClick={onRetry}>Try again</button>}<button type="button" className="m-btn m-btn-ghost" onClick={() => onHome("library")}>Back to the library</button></div>
    </section>
    <SiteFooter />
  </div>;
}

function Shell() {
  const toast = useToast();
  const [history, setHistory] = useState([]);
  const [total, setTotal] = useState(0);
  const [historyState, setHistoryState] = useState("loading");
  const [historyKey, setHistoryKey] = useState(0);
  const [names, setNames] = useState({});
  const [view, setView] = useState({ kind: "home" });
  const [command, setCommand] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const request = useRef(0);
  const shown = useRef(null);
  const addNames = useCallback((found) => setNames((current) => ({ ...current, ...found })), []);

  useEffect(() => {
    let cancelled = false;
    setHistoryState((state) => state === "ready" ? "ready" : "loading");
    apiRequest("/history?sort=recent&limit=200", { timeoutMs: 90000 }).then((data) => {
      if (cancelled) return;
      setHistory(data.history || []); setTotal(data.total || 0); setHistoryState("ready");
    }).catch(() => !cancelled && setHistoryState("error"));
    return () => { cancelled = true; };
  }, [historyKey]);

  const setLocation = (id, push = true) => {
    shown.current = id ?? null;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("report", String(id)); else url.searchParams.delete("report");
    url.hash = "";
    if (url.toString() !== window.location.href) window.history[push ? "pushState" : "replaceState"]({}, "", url);
  };
  const show = (next) => withTransition(() => { setView(next); window.scrollTo({ top: 0 }); });

  function home(target, push = true) {
    request.current += 1;
    setLocation(null, push);
    show({ kind: "home" });
    if (target === "library") requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("library")?.scrollIntoView({ block: "start" })));
  }

  async function openReport(item, passage, push = true) {
    const id = item.report_id;
    const current = ++request.current;
    if (item.research) { setLocation(id, push); show({ kind: "report", report: item, passage }); return; }
    setLocation(id, push);
    show({ kind: "loading", id });
    try {
      const data = await apiRequest(`/reports/${id}`, { timeoutMs: 90000 });
      if (current !== request.current) return;
      show({ kind: "report", report: data, passage });
    } catch (error) {
      if (current !== request.current) return;
      setView({ kind: "error", message: error.message, retry: () => openReport({ report_id: id }, passage, false) });
    }
  }

  async function analyze(period) {
    const saved = history.find((item) => item.has_research && samePeriod(item, period));
    if (saved) { openReport(saved); return; }
    const current = ++request.current;
    setLocation(null);
    show({ kind: "analyzing", period, pending: null, error: "" });
    const update = (change) => { if (current === request.current) setView((value) => value.kind === "analyzing" ? { ...value, ...change(value) } : value); };
    try {
      const report = await streamAnalysis(period, (event) => {
        if (event.type === "call") update(() => ({ pending: { call: event, findings: [], prices: null } }));
        if (event.type === "finding") update((value) => ({ pending: { ...value.pending, findings: [...(value.pending?.findings || []), event.finding] } }));
        if (event.type === "prices") update((value) => ({ pending: { ...value.pending, prices: event } }));
      });
      setHistoryKey((key) => key + 1);
      if (current !== request.current) { toast(`${companyName(period.ticker, names)} ${periodLabel(period)} is ready in the library`); return; }
      setLocation(report.report_id);
      show({ kind: "report", report });
      toast("Report ready · saved to the library");
    } catch (error) {
      if (current === request.current) update(() => ({ error: error.message || "This analysis couldn’t finish. Please try again." }));
      else toast(error.message, "warn");
    }
  }

  useEffect(() => {
    function navigate() {
      const id = reportIdFromSearch(window.location.search);
      if (id && id === shown.current) return;
      if (id) openReport({ report_id: id }, null, false);
      else {
        const invalid = new URLSearchParams(window.location.search).has("report");
        home(null, false);
        if (invalid) toast("That report link isn’t valid.", "warn");
      }
    }
    navigate();
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, []);

  useEffect(() => {
    if (view.kind !== "analyzing" || view.error) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [view.kind, view.period?.ticker, view.period?.year, view.period?.quarter, Boolean(view.error)]);

  useEffect(() => {
    function onKey(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommand((open) => !open); }
      else if (event.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) && !document.querySelector("dialog[open]")) { event.preventDefault(); setCommand(true); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const subject = view.report || view.period;
    document.title = subject ? `${companyName(subject.ticker, names)} ${periodLabel(subject)} · Earnings Analyzer` : "Earnings Analyzer";
    if (view.kind === "report" || view.kind === "analyzing") document.getElementById("report-title")?.focus({ preventScroll: true });
  }, [view.kind, view.report?.report_id, view.period?.ticker]);

  const openCommand = () => setCommand(true);
  const actions = [
    { key: "a-library", icon: "▦", title: "Browse the library", meta: `${history.filter((item) => item.has_research).length} calls`, run: () => home("library") },
    ...(view.kind === "report" ? [{ key: "a-copy", icon: "⧉", title: "Copy link to this report", meta: "", run: async () => { try { await navigator.clipboard.writeText(window.location.href); toast("Link copied"); } catch { toast("Couldn’t copy the link.", "warn"); } } }] : []),
  ];

  return <>
    <a className="m-skip" href="#main">Skip to content</a>
    <main id="main" className="m-app">
      {view.kind === "home" && <Landing history={history} total={total} historyState={historyState} names={names} onNames={addNames} onOpen={(item, passage) => openReport(item, passage)} onAnalyze={analyze} onCommand={openCommand} onRetry={() => setHistoryKey((key) => key + 1)} />}
      {view.kind === "loading" && <ReportSkeleton onHome={home} onCommand={openCommand} />}
      {view.kind === "error" && <ErrorView message={view.message} onRetry={view.retry} onHome={home} onCommand={openCommand} />}
      {view.kind === "report" && <Report key={view.report.report_id} report={view.report} initialPassage={view.passage} history={history} names={names} onOpen={(item) => openReport(item)} onHome={home} onCommand={openCommand} />}
      {view.kind === "analyzing" && <Analyzing period={view.period} pending={view.pending} error={view.error} elapsed={elapsed} names={names} onHome={home} onCommand={openCommand} onRetry={() => { request.current += 1; analyze(view.period); }} />}
    </main>
    {command && <CommandMenu history={history} names={names} onNames={addNames} actions={actions} onClose={() => setCommand(false)} onOpen={(item) => openReport(item)} onAnalyze={analyze} />}
  </>;
}

export default function App() {
  return <ToastProvider><Shell /></ToastProvider>;
}
