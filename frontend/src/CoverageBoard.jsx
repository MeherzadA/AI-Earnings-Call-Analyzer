import { useState } from "react";
import { callDateLabel, marketWindow } from "./reportPresentation.js";

function topic(title) {
  if (/\b(stock|shares?|price swing|traders?|options)\b/i.test(title)) return "Market moves";
  if (/\b(outlook|forecast|guidance|expects?)\b/i.test(title)) return "Outlook";
  if (/\b(earnings|results|revenue|profit|quarter|sales)\b/i.test(title)) return "Results";
  return "Company watch";
}

function StoryGlyph({ category }) {
  const paths = {"Market moves":"M8 36V25h7v11 M24 36V15h7v21 M40 36V6h7v30 M4 43h49", Outlook:"M29 5v8 M29 43v8 M6 28h8 M44 28h8 M29 28l12-12 M39 16h3v11 M44 28a15 15 0 1 1-15-15", Results:"M14 5h23l9 9v36H14z M37 5v10h9 M21 24h18 M21 32h18 M21 40h10", "Company watch":"M17 14h26v28H17z M23 20h14v16H23z M10 21h7 M10 34h7 M43 21h7 M43 34h7 M23 7v7 M37 7v7 M23 42v7 M37 42v7"};
  return <svg className="story-glyph" viewBox="0 0 58 56" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={paths[category]}/></svg>;
}

function Story({ item, lead }) {
  const category = topic(item.title);
  const suffix = ` - ${item.source}`;
  const title = item.title.endsWith(suffix) ? item.title.slice(0, -suffix.length) : item.title;
  const color = /reuters/i.test(item.source) ? "#d95b1b" : /bloomberg/i.test(item.source) ? "#4032a2" : /cnbc/i.test(item.source) ? "#006e97" : /investopedia/i.test(item.source) ? "#7643a0" : "#275c69";
  const initials = item.source.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join("");
  return <a className={`coverage-story ${lead ? "lead-story" : ""}`} style={{"--publisher-color":color}} href={item.url} target="_blank" rel="noreferrer" aria-label={`${title} — ${item.source}, ${callDateLabel(item.published_at)}. Opens article in a new tab.`}>
    <div className="story-publisher"><span className="publisher-seal" aria-hidden="true">{initials}</span><strong>{item.source}</strong><time dateTime={item.published_at}>{callDateLabel(item.published_at)}</time></div>
    <div className="story-content"><span className="story-topic">{category}</span><h4>{title}</h4><StoryGlyph category={category}/></div>
    <div className="story-action"><span>Read at {item.source}</span><b aria-hidden="true">↗</b></div>
  </a>;
}

export default function CoverageBoard({ news, result }) {
  const [filter, setFilter] = useState("All stories");
  const items = news.items || [];
  const categories = [...new Set(items.map(item=>topic(item.title)))];
  const visible = filter === "All stories" ? items : items.filter(item=>topic(item.title) === filter);
  return <section className="coverage-board" aria-labelledby="coverage-board-title">
    <header className="coverage-masthead"><div className="coverage-frequency"><span className="coverage-bars" aria-hidden="true"><i/><i/><i/></span><span>THE COVERAGE DESK</span><b>ARCHIVE · {result.ticker}</b></div><div className="coverage-title-row"><div><h3 id="coverage-board-title">What made the headlines.</h3><p>{news.start ? `${callDateLabel(news.start)} – ${callDateLabel(news.end)}` : "Coverage around the call"} <span>· UTC publication dates</span></p></div><span className="coverage-count"><b>{items.length}</b> sources</span></div></header>
    {items.length > 0 ? <><div className="coverage-toolbar"><div className="coverage-filters" role="group" aria-label="Filter coverage by headline topic">{["All stories",...categories].map(category=><button type="button" key={category} aria-pressed={filter === category} onClick={()=>setFilter(category)}>{category}</button>)}</div><span className="coverage-visible-count" role="status" aria-live="polite">{visible.length} {visible.length === 1 ? "story" : "stories"}</span></div><div className="coverage-grid" key={filter}>{visible.map((item,i)=><Story key={item.url} item={item} lead={i === 0}/>)}</div></> : <p className="coverage-empty">{news.message || "No matching historical headlines were returned."}</p>}
    <footer className="coverage-board-footer"><p><strong>Know the window.</strong> {marketWindow(result)} Headline price windows may differ.</p><p>Topics describe headline text only. These links open the publishers’ articles; their contents have not been analysed or verified by this app.</p></footer>
  </section>;
}
