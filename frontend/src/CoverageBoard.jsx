import { useState } from "react";
import { callDateLabel, marketWindow } from "./reportPresentation.js";

// Website marks, bundled locally; unknown publishers keep their written name.
const PUBLISHER_MARKS = {
  cnbc: "cnbc", reuters: "reuters", investopedia: "investopedia", "9to5mac": "9to5mac",
  bloomberg: "bloomberg", cnn: "cnn", "cnn business": "cnn", "cbs news": "cbs",
  "yahoo finance": "yahoo", "yahoo finance canada": "yahoo", "the wall street journal": "wsj", wsj: "wsj",
  marketwatch: "marketwatch", "barron's": "barrons", barrons: "barrons", "financial times": "ft",
  "seeking alpha": "seekingalpha", "the motley fool": "fool", "associated press": "ap", "ap news": "ap",
  techcrunch: "techcrunch", thestreet: "thestreet", "the street": "thestreet", benzinga: "benzinga",
};

function PublisherMark({ source }) {
  const [failed, setFailed] = useState(false);
  const name = source.toLowerCase().replace(/\.com$/, "");
  const mark = PUBLISHER_MARKS[name];
  const company = { "nvidia newsroom": "nvidia", "microsoft": "microsoft", "apple newsroom": "apple" }[name];
  if (failed || (!mark && !company)) return null;
  return <span className="publisher-mark" aria-hidden="true"><img src={mark ? `/publishers/${mark}.png` : `/logos/${company}.svg`} alt="" width="36" height="36" onError={() => setFailed(true)} /></span>;
}

function topic(title) {
  if (/\b(stock|shares?|price swing|traders?|options)\b/i.test(title)) return "Market moves";
  if (/\b(outlook|forecast|guidance|expects?)\b/i.test(title)) return "Outlook";
  if (/\b(earnings|results|revenue|profit|quarter|sales)\b/i.test(title)) return "Results";
  return "Other coverage";
}

function Story({ item, lead }) {
  const category = topic(item.title);
  const suffix = ` - ${item.source}`;
  const title = item.title.endsWith(suffix) ? item.title.slice(0, -suffix.length) : item.title;
  const color = /reuters/i.test(item.source) ? "#d95b1b" : /bloomberg/i.test(item.source) ? "#4032a2" : /cnbc/i.test(item.source) ? "#006e97" : /investopedia/i.test(item.source) ? "#7643a0" : "#275c69";
  return <a className={`coverage-story ${lead ? "lead-story" : ""}`} style={{"--publisher-color":color}} href={item.url} target="_blank" rel="noreferrer" aria-label={`${title} — ${item.source}, ${callDateLabel(item.published_at)}. Opens article in a new tab.`}>
    <div className="story-publisher"><PublisherMark source={item.source}/><strong>{item.source}</strong><time dateTime={item.published_at}>{callDateLabel(item.published_at)}</time></div>
    <div className="story-content"><span className="story-topic">{category}</span><h4>{title}</h4></div>
    <div className="story-action"><span>Read at {item.source}</span><b aria-hidden="true">↗</b></div>
  </a>;
}

export default function CoverageBoard({ news, result }) {
  const [filter, setFilter] = useState("All stories");
  const items = news.items || [];
  const categories = [...new Set(items.map(item=>topic(item.title)))];
  const visible = filter === "All stories" ? items : items.filter(item=>topic(item.title) === filter);
  return <section className="coverage-board" aria-labelledby="coverage-board-title">
    <header className="coverage-masthead"><div className="coverage-title-row"><div><h3 id="coverage-board-title">Headlines before the call</h3><p>{news.start ? `${callDateLabel(news.start)} – ${callDateLabel(news.end)}` : "Coverage around the call"} <span>· UTC publication dates</span></p></div><span className="coverage-count">{items.length} selected {items.length === 1 ? "headline" : "headlines"}</span></div></header>
    {items.length > 0 ? <><div className="coverage-toolbar"><div className="coverage-filters" role="group" aria-label="Filter coverage by headline topic">{["All stories",...categories].map(category=><button type="button" key={category} aria-pressed={filter === category} onClick={()=>setFilter(category)}>{category}</button>)}</div><span className="coverage-visible-count" role="status" aria-live="polite">{visible.length} {visible.length === 1 ? "story" : "stories"}</span></div><div className="coverage-grid" key={filter}>{visible.map((item,i)=><Story key={item.url} item={item} lead={i === 0}/>)}</div></> : <p className="coverage-empty">{news.message || "The feed returned no matching headlines in the 14-day window ending on the call date. This does not mean no news was published."}</p>}
    <footer className="coverage-board-footer"><p><strong>Chart timing:</strong> {marketWindow(result)} Headline prices may refer to a different trading session.</p><p>Up to 5 headlines, one per publisher, from Google News RSS. Historical coverage can be incomplete; same-day stories may have appeared after the call. Topics describe headline text only. Article contents have not been read or verified by this app.</p></footer>
  </section>;
}
