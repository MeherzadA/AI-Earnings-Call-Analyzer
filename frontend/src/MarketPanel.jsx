import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.js";
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
  const [extended, setExtended] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const attempted = useRef(false);
  async function loadMonth() {
    setLoading(true); setError("");
    try { setExtended(await apiRequest(`/reports/${result.report_id}/prices`, {method:"POST"})); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (!compact && result.daily_prices?.length < 22 && !attempted.current) { attempted.current = true; loadMonth(); } }, [compact, result.report_id]);
  const all = priceSeries(extended || result);
  const points = all.slice(0, (compact ? 5 : windowDays) + 1);
  const first = all[0], next = all[1], fifth = all[5], month = all[21];
  const color = (points.at(-1)?.change || 0) < 0 ? "#ce4052" : "#078267";
  const value = mode === "change" ? "change" : "price";
  return <section className={`market-panel market-v2 ${compact ? "market-panel-compact" : ""}`} aria-label="Price action after the call">
    <div className="market-v2-heading"><div><p className="section-kicker">{compact ? "THE MARKET" : "PRICE ACTION"}</p><h2>{compact ? "After the call" : "The move, and what followed"}</h2></div><span className="market-unit">Regular closes · USD</span></div>
    {!all.length ? <p className="market-empty">Closing prices aren’t available for this call. The transcript and report remain available.</p> : <>
      <div className="market-summary">
        <div><span>Next trading day</span><strong className={tone(next?.change)}>{signed(next?.change)}</strong><small>{next ? callDateLabel(next.date) : "Not available"}</small></div>
        <div><span>After 5 trading days</span><strong className={tone(fifth?.change)}>{signed(fifth?.change)}</strong><small>{fifth ? callDateLabel(fifth.date) : "Not available"}</small></div>
        {!compact && <div><span>After 1 month · 21 trading days</span><strong className={tone(month?.change)}>{signed(month?.change)}</strong><small>{month ? callDateLabel(month.date) : loading ? "Loading longer history…" : "21st trading-day close not available"}</small></div>}
      </div>
      <div className="chart-control-row"><div className="chart-segment" aria-label="Chart measure"><button type="button" aria-pressed={mode === "change"} onClick={() => setMode("change")}>Return %</button><button type="button" aria-pressed={mode === "price"} onClick={() => setMode("price")}>Price $</button></div>{!compact && <div className="chart-segment" aria-label="Chart window"><button type="button" aria-pressed={windowDays === 1} onClick={() => setWindowDays(1)}>1 day</button><button type="button" aria-pressed={windowDays === 5} onClick={() => setWindowDays(5)}>5 days</button><button type="button" aria-pressed={windowDays === 21} onClick={() => setWindowDays(21)}>1 month</button></div>}</div>
      {!compact && loading && <p className="market-status" role="status">Loading up to 21 post-call trading days…</p>}
      {!compact && error && <p className="market-status" role="alert">{error} <button type="button" className="text-btn" onClick={loadMonth}>Retry prices</button></p>}
      {!compact && !loading && windowDays > all.length - 1 && <p className="market-status">Only {all.length - 1} post-call trading {all.length === 2 ? "day is" : "days are"} available. The chart ends on the last available close.</p>}
      <div className="price-chart" aria-label={`${result.ticker} ${mode === "change" ? "return from call-day close" : "closing price"}`}>
        <ResponsiveContainer width="100%" height={compact ? 210 : 340}>
          <AreaChart data={points} margin={{ top: 20, right: 15, left: compact ? -18 : 0, bottom: 8 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="#e4e9ef" strokeDasharray="3 5" />
            <XAxis dataKey="date" tickFormatter={(date) => { const point = points.find((item) => item.date === date); return compact ? point === first ? "Call" : point?.session.replace("Day ", "D") : new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {month:"short",day:"numeric",timeZone:"UTC"}); }} tickLine={false} axisLine={false} tickMargin={13} interval={compact ? 0 : "preserveStartEnd"} minTickGap={28} fontSize={compact ? 11 : 13} stroke="#65748a" />
            <YAxis tickFormatter={(number) => mode === "change" ? `${number > 0 ? "+" : ""}${Number(number).toFixed(Math.abs(number) < 10 ? 1 : 0)}%` : `$${Number(number).toFixed(number < 100 ? 2 : 0)}`} tickLine={false} axisLine={false} fontSize={compact ? 11 : 13} stroke="#65748a" domain={mode === "change" ? [(min) => Math.min(0, Math.floor(min) - 1), (max) => Math.max(0, Math.ceil(max) + 1)] : [(min) => Math.floor(min * .99 * 100) / 100, (max) => Math.ceil(max * 1.01 * 100) / 100]} />
            <ReferenceLine y={mode === "change" ? 0 : first.price} stroke="#8e9bb0" strokeDasharray="4 4" />
            <Tooltip content={<PriceTooltip />} cursor={{stroke:"#8898b0",strokeDasharray:"3 3"}} />
            <Area type="linear" dataKey={value} stroke={color} strokeWidth={2.5} fill={color} fillOpacity={.08} baseValue={mode === "change" ? 0 : first.price} dot={points.length > 10 ? false : {fill:color,r:3,stroke:"white",strokeWidth:1.5}} activeDot={{r:6,stroke:"white",strokeWidth:2}} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="market-baseline"><span>Baseline · {callDateLabel(first.date)} close</span><strong>${first.price.toFixed(2)}</strong></div>
      {!compact && <><p className="market-explanation">Every return starts at the same call-day close. One month means 21 trading sessions; the longer window can include unrelated company and market news. Daily closes do not show after-hours or intraday moves, or establish what caused a price change.</p><section className="daily-closes"><h3>Daily closes · selected window</h3><div className="daily-closes-scroll"><table><thead><tr><th>Session</th><th>Date</th><th>Close</th><th>From baseline</th></tr></thead><tbody>{points.map((point) => <tr key={point.date}><th scope="row">{point.session}</th><td>{point.date}</td><td>${point.price.toFixed(2)}</td><td className={tone(point.change)}>{signed(point.change)}</td></tr>)}</tbody></table></div></section></>}
      <p className="price-provider">Source: Yahoo Finance · {compact ? "Regular daily closes" : "Prices rounded to cents; intermediate and monthly returns use displayed closes. Stored 1-day and 5-day returns may use provider precision."}</p>
      {compact && onExplore && <button type="button" className="market-explore" onClick={onExplore}>Explore price action →</button>}
    </>}
  </section>;
}
