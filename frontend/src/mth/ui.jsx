import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CATEGORIES, companyName, dateTicks, logoSources, priceGeometry, priceLabel, priceScale, publisherIcon, shortDate, signedPct } from "./format.js";

export function useReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

// Cross-fade between app states where the browser supports it; plain update otherwise.
export function withTransition(update) {
  if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { update(); return; }
  // A newer transition (or a hidden tab) skips this one; the update still runs, so the rejection is noise.
  const transition = document.startViewTransition(() => flushSync(update));
  for (const promise of [transition.ready, transition.finished, transition.updateCallbackDone]) promise?.catch(() => {});
}

export function useElementWidth(fallback = 1200) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setWidth(ref.current.clientWidth || fallback);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width) || fallback));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width];
}

// Remember which source worked (or that none did) so lists don't re-try failing URLs.
const logoChoice = new Map();

export function CompanyLogo({ ticker, size = 40, radius, className = "", alt = "" }) {
  const sources = logoSources(ticker);
  const [index, setIndex] = useState(() => logoChoice.get(ticker) ?? 0);
  useEffect(() => { setIndex(logoChoice.get(ticker) ?? 0); }, [ticker]);
  const style = { width: size, height: size, borderRadius: radius ?? Math.round(size * 0.28), fontSize: Math.round(size * 0.42) };
  if (index >= sources.length) return <span className={`m-logo m-monogram ${className}`} style={style} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>{(ticker || "?").slice(0, 1)}</span>;
  return <img className={`m-logo ${className}`} style={style} src={sources[index]} alt={alt} loading="lazy" referrerPolicy="no-referrer"
    onLoad={() => logoChoice.set(ticker, index)}
    onError={() => { logoChoice.set(ticker, index + 1); setIndex(index + 1); }} />;
}

export function PublisherIcon({ item, size = 20 }) {
  const [failed, setFailed] = useState(false);
  const src = publisherIcon(item);
  if (!src || failed) return <span className="m-pub-icon m-monogram" style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }} aria-hidden="true">{(item?.source || "?").slice(0, 1)}</span>;
  return <img className="m-pub-icon" src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

export function Kbd({ children, dark = false, label }) {
  return <kbd className={`m-kbd ${dark ? "m-kbd-dark" : ""}`} aria-label={label}>{children}</kbd>;
}

export const modKey = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";

export function CategoryChip({ category }) {
  const meta = CATEGORIES[category] || { label: category, fg: "#526B5D" };
  return <span className="m-cat" style={{ color: meta.fg }}>{meta.label}</span>;
}

export function Skeleton({ width = "100%", height = 16, radius = 8, className = "", style }) {
  return <span className={`m-skel ${className}`} style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((items) => [...items.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((items) => items.map((item) => item.id === id ? { ...item, leaving: true } : item)), 3600);
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3900);
  }, []);
  return <ToastContext.Provider value={push}>
    {children}
    <div className="m-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => <div key={toast.id} className={`m-toast m-toast-${toast.tone} ${toast.leaving ? "is-leaving" : ""}`}>
        <span className="m-toast-dot" aria-hidden="true" />{toast.message}
      </div>)}
    </div>
  </ToastContext.Provider>;
}

// Daily closing prices after the call.
export function QuoteRail({ prices, height: tall = 340, label, caption }) {
  const [wrap, width] = useElementWidth(1200);
  const height = width < 640 ? Math.min(tall, Math.round(94 + Math.max(120, width * 0.38))) : tall;
  const inset = width < 640 ? 28 : Math.min(90, width * 0.06);
  const geometry = priceGeometry(prices || [], { left: inset, right: width - inset, top: 40, bottom: height - 54 });
  if (!geometry) return <div ref={wrap} className="m-rail m-rail-empty" style={{ height }}>{caption}</div>;
  const last = geometry.points.at(-1);
  return <div ref={wrap} className="m-rail">
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={geometry.path} fill="none" stroke="#B6F5C9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r="4" fill="#FFB4A3" stroke="#0F3B2C" strokeWidth="2" />
    </svg>
  </div>;
}

// Interactive closing-price chart: hover, tap or arrow keys move the readout across trading days.
export function PriceChart({ prices, active, onActive, marks = [], height: tall = 380, title }) {
  const [wrap, width] = useElementWidth(1000);
  const narrow = width < 640;
  const height = narrow ? Math.min(tall, 280) : tall;
  const box = { left: 8, right: width - (narrow ? 58 : 72), top: 14, bottom: height - 34 };
  const scale = priceScale(prices || [], box, narrow ? 3 : 4);
  if (!scale) return <div ref={wrap} className="m-pchart-empty">Closing prices aren’t available for this call.</div>;
  const { points, path, ticks, y } = scale;
  const base = points[0];
  const index = active ?? points.length - 1;
  const point = points[Math.max(0, Math.min(points.length - 1, index))];
  const change = base.price > 0 ? (point.price / base.price - 1) * 100 : null;
  const tone = change == null || Math.abs(change) < 0.005 ? "flat" : change > 0 ? "up" : "down";
  const fill = `M${base.x} ${base.y} ${path.slice(path.indexOf("L"))} L${points.at(-1).x} ${base.y} Z`;
  const nearest = (clientX, target) => {
    const rect = target.getBoundingClientRect();
    const x = (clientX - rect.left) * (width / rect.width);
    return points.reduce((best, item) => Math.abs(item.x - x) < Math.abs(best.x - x) ? item : best).index;
  };
  function onKeyDown(event) {
    const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: 1, ArrowDown: -1 };
    if (event.key in moves) { event.preventDefault(); onActive(Math.max(0, Math.min(points.length - 1, index + moves[event.key]))); }
    if (event.key === "Home") { event.preventDefault(); onActive(0); }
    if (event.key === "End") { event.preventDefault(); onActive(points.length - 1); }
  }
  const dayLabel = point.index === 0 ? "Call day" : `${point.index} trading ${point.index === 1 ? "day" : "days"} after`;
  const id = `pc-${title?.replace(/\W+/g, "-") || "price"}`;
  return <div ref={wrap} className="m-pchart">
    <div className="m-pchart-read" aria-live="polite">
      <span className="m-pchart-date">{shortDate(point.date)} <small>{dayLabel}</small></span>
      <b className="m-pchart-price">{priceLabel(point.price)}</b>
      {point.index > 0 && <span className={`m-pchart-change is-${tone}`}>{signedPct(change)} since the call-day close</span>}
    </div>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-desc`} className="m-pchart-svg">
      <desc id={`${id}-desc`}>{title}. Use the left and right arrow keys to move between days.</desc>
      <defs>
        <clipPath id={`${id}-above`}><rect x="0" y="0" width={width} height={base.y} /></clipPath>
        <clipPath id={`${id}-below`}><rect x="0" y={base.y} width={width} height={height} /></clipPath>
      </defs>
      {ticks.map((value) => <g key={value} className="m-pchart-tick">
        <line x1={box.left} x2={box.right} y1={y(value)} y2={y(value)} />
        <text x={box.right + 10} y={y(value)} dy="0.32em">{priceLabel(value).replace(/\.00$/, "")}</text>
      </g>)}
      <path d={fill} className="m-pchart-area is-up" clipPath={`url(#${id}-above)`} />
      <path d={fill} className="m-pchart-area is-down" clipPath={`url(#${id}-below)`} />
      <line className="m-pchart-base" x1={box.left} x2={box.right} y1={base.y} y2={base.y} />
      <path d={path} className="m-pchart-line" />
      {dateTicks(points.length, narrow ? 3 : 5).map((i) => <text key={i} className="m-pchart-date-tick" x={points[i].x} y={height - 10}
        textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>{i === 0 ? "Call day" : shortDate(points[i].date, false)}</text>)}
      {marks.filter((i) => points[i]).map((i) => <circle key={i} className="m-pchart-mark" cx={points[i].x} cy={points[i].y} r="4" />)}
      <line className="m-pchart-cross" x1={point.x} x2={point.x} y1={box.top} y2={box.bottom} />
      <circle className={`m-pchart-dot is-${tone}`} cx={point.x} cy={point.y} r="6" />
      <rect className="m-pchart-hit" x="0" y="0" width={box.right + 4} height={height} tabIndex={0} role="slider"
        aria-label="Trading day" aria-valuemin={0} aria-valuemax={points.length - 1} aria-valuenow={point.index} aria-valuetext={`${shortDate(point.date)}, ${priceLabel(point.price)}${point.index ? `, ${signedPct(change)} since the call` : ""}`}
        onPointerMove={(event) => onActive(nearest(event.clientX, event.currentTarget))}
        onPointerDown={(event) => onActive(nearest(event.clientX, event.currentTarget))}
        onPointerLeave={(event) => event.pointerType === "mouse" && onActive(null)}
        onKeyDown={onKeyDown} />
    </svg>
    <table className="sr-only"><caption>{title}</caption><thead><tr><th>Date</th><th>Close</th><th>Change since call day</th></tr></thead>
      <tbody>{points.map((item) => <tr key={item.index}><td>{shortDate(item.date)}</td><td>{priceLabel(item.price)}</td><td>{item.index ? signedPct((item.price / base.price - 1) * 100) : "—"}</td></tr>)}</tbody></table>
  </div>;
}

export function Spark({ prices, width = 360, height = 80, stroke = "#0F3B2C", dot = "#C2321A" }) {
  const geometry = priceGeometry(prices || [], { left: 0, right: width, top: 6, bottom: height - 6 });
  if (!geometry) return <Skeleton height={height} radius={12} />;
  const fifth = geometry.points[Math.min(5, geometry.points.length - 1)];
  return <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden="true" className="m-spark" preserveAspectRatio="none">
    <polyline points={geometry.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength="1" className="m-draw" />
    <circle cx={fifth.x} cy={fifth.y} r="5" fill={dot} />
  </svg>;
}

export function companyLabel(ticker, names) {
  return companyName(ticker, names);
}
