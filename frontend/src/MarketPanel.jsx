import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { callDateLabel, priceSeries } from "./reportPresentation.js";

const signed = (value) => value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const tone = (value) => value > 0 ? "gain" : value < 0 ? "loss" : "";

function PriceTooltip({ active, payload }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return <div className="price-tooltip"><strong>{callDateLabel(point.date)}</strong><span>{point.session} · regular close</span><b>${point.price.toFixed(2)}</b><em className={tone(point.change)}>{signed(point.change)} from call-day close</em></div>;
}

export default function MarketPanel({ result, compact = false, onExplore }) {
  const [mode, setMode] = useState("change");
  const [windowDays, setWindowDays] = useState(5);
  const all = priceSeries(result);
  const points = windowDays === 1 ? all.slice(0, 2) : all;
  const first = all[0], next = all[1], fifth = all[5];
  const followThrough = next && fifth ? (fifth.price / next.price - 1) * 100 : null;
  const color = (points.at(-1)?.change || 0) < 0 ? "#ce4052" : "#078267";
  const value = mode === "change" ? "change" : "price";
  return <section className={`market-panel market-v2 ${compact ? "market-panel-compact" : ""}`} aria-label="Price action after the call">
    <div className="market-v2-heading"><div><p className="section-kicker">{compact ? "THE MARKET" : "PRICE ACTION"}</p><h2>{compact ? "After the call" : "The move, and what followed"}</h2></div><span className="market-unit">Regular closes · USD</span></div>
    {!all.length ? <p className="market-empty">Closing prices aren’t available for this call. The transcript and report remain available.</p> : <>
      <div className="market-summary">
        <div><span>Next trading day</span><strong className={tone(next?.change)}>{signed(next?.change)}</strong><small>{next ? callDateLabel(next.date) : "Not available"}</small></div>
        <div><span>After 5 trading days</span><strong className={tone(fifth?.change)}>{signed(fifth?.change)}</strong><small>{fifth ? callDateLabel(fifth.date) : "Not available"}</small></div>
        {!compact && <div><span>Following the first move</span><strong className={tone(followThrough)}>{signed(followThrough)}</strong><small>Next close → fifth close</small></div>}
      </div>
      <div className="chart-control-row"><div className="chart-segment" aria-label="Chart measure"><button type="button" aria-pressed={mode === "change"} onClick={() => setMode("change")}>Return %</button><button type="button" aria-pressed={mode === "price"} onClick={() => setMode("price")}>Price $</button></div>{!compact && <div className="chart-segment" aria-label="Chart window"><button type="button" aria-pressed={windowDays === 1} onClick={() => setWindowDays(1)}>1 day</button><button type="button" aria-pressed={windowDays === 5} onClick={() => setWindowDays(5)}>{all.length >= 6 ? "5 days" : "Available days"}</button></div>}</div>
      <div className="price-chart" aria-label={`${result.ticker} ${mode === "change" ? "return from call-day close" : "closing price"}`}>
        <ResponsiveContainer width="100%" height={compact ? 210 : 340}>
          <AreaChart data={points} margin={{ top: 20, right: 15, left: compact ? -18 : 0, bottom: 8 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="#e4e9ef" strokeDasharray="3 5" />
            <XAxis dataKey="date" tickFormatter={(date) => { const point = points.find((item) => item.date === date); return compact ? point === first ? "Call" : point?.session.replace("Day ", "D") : new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {month:"short",day:"numeric",timeZone:"UTC"}); }} tickLine={false} axisLine={false} tickMargin={13} interval={0} fontSize={compact ? 11 : 13} stroke="#65748a" />
            <YAxis tickFormatter={(number) => mode === "change" ? `${number > 0 ? "+" : ""}${Number(number).toFixed(Math.abs(number) < 10 ? 1 : 0)}%` : `$${Number(number).toFixed(number < 100 ? 2 : 0)}`} tickLine={false} axisLine={false} fontSize={compact ? 11 : 13} stroke="#65748a" domain={mode === "change" ? [(min) => Math.min(0, Math.floor(min) - 1), (max) => Math.max(0, Math.ceil(max) + 1)] : [(min) => Math.floor(min * .99 * 100) / 100, (max) => Math.ceil(max * 1.01 * 100) / 100]} />
            <ReferenceLine y={mode === "change" ? 0 : first.price} stroke="#8e9bb0" strokeDasharray="4 4" />
            <Tooltip content={<PriceTooltip />} cursor={{stroke:"#8898b0",strokeDasharray:"3 3"}} />
            <Area type="linear" dataKey={value} stroke={color} strokeWidth={2.5} fill={color} fillOpacity={.08} baseValue={mode === "change" ? 0 : first.price} dot={{fill:color,r:3,stroke:"white",strokeWidth:1.5}} activeDot={{r:6,stroke:"white",strokeWidth:2}} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="market-baseline"><span>Baseline · {callDateLabel(first.date)} close</span><strong>${first.price.toFixed(2)}</strong></div>
      {!compact && <div className="market-reading"><h3>How to read this</h3><p>The first return compares the call-day close with the next trading-day close. The fifth-day return uses that same baseline. “Following the first move” measures the change between those two later closes.</p><p>After-hours and intraday moves are not shown. A headline can describe a rise during those windows while a later close is lower.</p></div>}
      <details className="price-details"><summary>Closing prices & source</summary><table><caption className="sr-only">{result.ticker} daily closes around the call</caption><thead><tr><th>Session</th><th>Date</th><th>Close</th><th>Return</th></tr></thead><tbody>{all.map((point) => <tr key={point.date}><th scope="row">{point.session}</th><td>{point.date}</td><td>${point.price.toFixed(2)}</td><td className={tone(point.change)}>{signed(point.change)}</td></tr>)}</tbody></table><p>Source: Yahoo Finance. Prices are rounded; stored endpoint returns may use provider precision. Intermediate returns are computed from displayed closes. Price moves do not establish cause.</p></details>
      {compact && onExplore && <button type="button" className="market-explore" onClick={onExplore}>Explore price action →</button>}
    </>}
  </section>;
}
