import { useState } from "react";
import { companyName, periodLabel, shortDate } from "./format.js";
import { CompanyLogo, Skeleton } from "./ui.jsx";
import { AppBar } from "./Landing.jsx";
import { AfterCard, FindingCard, Modal, SourcePanel, TranscriptDrawer, useNarrow } from "./Report.jsx";

// The report, assembling itself: stages up top, findings landing as each passes its checks.
export default function Analyzing({ period, pending, error, elapsed, names, onHome, onRetry, onCommand }) {
  const narrow = useNarrow();
  const [selected, setSelected] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sheet, setSheet] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const call = pending?.call;
  const findings = pending?.findings || [];
  const prices = pending?.prices?.daily_prices || [];
  const passages = call?.passages || null;
  const name = companyName(period.ticker, names);
  const finding = findings[Math.min(selected, findings.length - 1)];
  const failed = Boolean(error);
  const stages = [
    { label: call ? "Found the transcript" : "Finding the transcript", state: call ? "done" : "active" },
    { label: passages ? `Reading ${passages.length} passages` : "Reading the passages", state: findings.length ? "done" : call ? "active" : "todo" },
    { label: findings.length ? `Checking every quote · ${findings.length} kept so far` : "Checking every quote word for word", state: findings.length ? "active" : "todo" },
    { label: pending?.prices ? "Pulled the prices" : "Pulling prices", state: pending?.prices ? "done" : call ? "active" : "todo" },
    { label: "Saving to the library", state: "todo" },
  ];
  const progress = failed ? 100 : Math.min(94, 6 + (call ? 14 : 0) + findings.length * 11 + (pending?.prices ? 8 : 0) + Math.min(elapsed, 45) * 0.6);
  return <div className="m-report m-analyzing">
    <AppBar variant="report" onHome={onHome} onCommand={onCommand} onLibrary={() => onHome("library")} />
    <section className="m-rhero">
      <p className="m-crumb m-mono"><a href="?" onClick={(event) => { event.preventDefault(); onHome(); }}>Library</a> / {name} / {periodLabel(period)}</p>
      <div className="m-rhero-top">
        <CompanyLogo ticker={period.ticker} size={76} radius={20} className="m-rhero-logo" alt={name} />
        <div className="m-rhero-title">
          <h1 tabIndex={-1} id="report-title">{name} <span>{periodLabel(period)}</span></h1>
          <span className="m-mono m-rhero-sub" role="status" aria-live="polite">{failed ? "This read couldn’t finish" : `Reading the call · ${elapsed}s${call?.call_date ? ` · call on ${shortDate(call.call_date)}` : ""}`}</span>
        </div>
        <div className="m-rhero-actions"><div className="m-rhero-btns">
          {passages && <button type="button" className="m-btn m-btn-ghost" onClick={() => setDrawer({ focus: finding?.citations[0].passage_id })}>Read the transcript now</button>}
          <button type="button" className="m-btn m-btn-ghost" onClick={() => onHome()}>{failed ? "Back to the library" : "Browse while it reads"}</button>
        </div></div>
      </div>
      <div className="m-rhero-grid">
        <div className="m-stages-wrap">
          <p className="m-eyebrow m-eyebrow-mint">{failed ? "Stopped" : "About 40 seconds"}</p>
          {failed ? <div className="m-fail" role="alert">
            <p className="m-short">{error}</p>
            <div className="m-rhero-btns"><button type="button" className="m-btn m-btn-mint" onClick={onRetry}>Try again</button></div>
          </div> : <>
            <ol className="m-stages">{stages.map((stage) => <li key={stage.label} className={`is-${stage.state}`}><span className="m-stage-dot" aria-hidden="true">{stage.state === "done" ? "✓" : ""}</span>{stage.label}{stage.state === "active" && <span className="sr-only"> (in progress)</span>}</li>)}</ol>
            <div className="m-progress" role="progressbar" aria-label="Analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{ width: `${progress}%` }} /></div>
            <p className="m-short-note">Findings appear as they pass their checks. If you leave, the read keeps going and lands in the library.</p>
          </>}
        </div>
        <AfterCard report={{ return_1day: pending?.prices?.return_1day, return_5day: pending?.prices?.return_5day }} prices={prices} loading={!pending?.prices && !failed} />
      </div>
    </section>

    <section className="m-findings" aria-labelledby="stream-title">
      <div className="m-findings-list">
        <p className="m-eyebrow m-eyebrow-green">What mattered</p>
        <h2 className="m-h2-r" id="stream-title">{findings.length ? `${findings.length} ${findings.length === 1 ? "finding" : "findings"} so far, each with its line.` : "Findings land here as they’re checked."}</h2>
        <div aria-live="polite" className="m-stream">
          {findings.map((item, index) => <FindingCard key={item.id || index} finding={{ ...item, id: item.id || `F${index + 1}` }} selected={index === selected} style={{ "--i": 0 }}
            onSelect={() => { if (narrow) setSheet(item.citations[0]); else { setSelected(index); setOffset(0); } }} onCite={(citation) => { setSelected(index); setOffset(0); if (narrow) setSheet(citation); }} />)}
        </div>
        {!failed && Array.from({ length: Math.max(1, 3 - findings.length) }, (_, i) => <div key={i} className="m-find is-skeleton" aria-hidden="true"><Skeleton width={96} height={22} radius={999} /><Skeleton height={22} width="80%" /><Skeleton height={14} /><Skeleton height={14} width="60%" /></div>)}
      </div>
      <aside className="m-findings-aside" aria-label="Source passage">
        {finding && !narrow && <SourcePanel passages={passages} citation={finding.citations[0]} offset={offset} onOffset={setOffset} onOpenTranscript={(focus) => setDrawer({ focus })} />}
        {!finding && !narrow && <div className="m-source m-source-wait"><span className="m-eyebrow m-eyebrow-mint">Source</span><p className="m-mono">The passage behind the first finding opens here.</p><Skeleton height={12} /><Skeleton height={12} width="70%" /></div>}
        <div className="m-checks"><b>How these are checked</b>Each finding is kept only if its quote is found word for word in the transcript and its numbers match. Not reviewed by a person.</div>
      </aside>
    </section>
    {sheet && <Modal className="m-sheet" label="Source passage" onClose={() => setSheet(null)}>
      <button type="button" className="m-close m-sheet-close m-hit" onClick={() => setSheet(null)} aria-label="Close source">×</button>
      <SourcePanel passages={passages} citation={sheet} offset={0} onOffset={() => {}} />
    </Modal>}
    {drawer && <TranscriptDrawer passages={passages} focus={drawer.focus} citations={findings.flatMap((item) => item.citations)} title={`${name} ${periodLabel(period)}`} onClose={() => setDrawer(null)} />}
  </div>;
}
