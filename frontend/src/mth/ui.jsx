import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CATEGORIES, LOGOS, companyName, markedSessions, priceGeometry } from "./format.js";

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

export function CompanyLogo({ ticker, size = 40, radius, className = "", alt = "" }) {
  const [failed, setFailed] = useState(false);
  const file = LOGOS[ticker];
  const style = { width: size, height: size, borderRadius: radius ?? Math.round(size * 0.28), fontSize: Math.round(size * 0.42) };
  if (!file || failed) return <span className={`m-logo m-monogram ${className}`} style={style} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>{(ticker || "?").slice(0, 1)}</span>;
  return <img className={`m-logo ${className}`} style={style} src={`/logos/${file}.svg`} alt={alt} onError={() => setFailed(true)} />;
}

export function Kbd({ children, dark = false, label }) {
  return <kbd className={`m-kbd ${dark ? "m-kbd-dark" : ""}`} aria-label={label}>{children}</kbd>;
}

export const modKey = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";

export function CategoryChip({ category }) {
  const meta = CATEGORIES[category] || { label: category, bg: "#F2EBDD", fg: "#5D7A6C" };
  return <span className="m-cat" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span>;
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

// The signature element: what was said on the call, riding the closes that followed it.
// With three weeks of closes the marked sessions sit close together; drop whichever labels
// would collide, keeping the call day, +5 days and the last close first.
const LABEL_PRIORITY = ["CALL DAY", "+5 DAYS", "HIGH", "LOW", "+1 DAY"];
function railLabels(points, marks, { floor, priceSize }) {
  const rank = (mark) => { const at = LABEL_PRIORITY.indexOf(mark); return at === -1 ? 1.5 : at; };
  const order = points.filter((point) => marks.has(point.index)).sort((a, b) => rank(marks.get(a.index)) - rank(marks.get(b.index)));
  const axis = [], prices = [], labels = new Map();
  for (const point of order) {
    const mark = marks.get(point.index);
    const axisWidth = mark.length * 7.2;
    const showAxis = !axis.some((other) => Math.abs(other.x - point.x) < (other.w + axisWidth) / 2 + 8);
    if (showAxis) axis.push({ x: point.x, w: axisWidth });
    const priceY = mark === "HIGH" || point.y > floor - 40 ? point.y - 16 : point.y + 28;
    const priceWidth = (point.price.toFixed(2).length + 1) * priceSize * 0.62;
    const showPrice = !prices.some((other) => Math.abs(other.x - point.x) < (other.w + priceWidth) / 2 + 4 && Math.abs(other.y - priceY) < priceSize + 4);
    if (showPrice) prices.push({ x: point.x, y: priceY, w: priceWidth });
    labels.set(point.index, { axis: showAxis, price: showPrice, priceY });
  }
  return labels;
}

export function QuoteRail({ prices, quotes, height: tall = 340, compact = false, label, caption }) {
  const [wrap, width] = useElementWidth(1200);
  // A chart much taller than it is wide turns each day into a cliff the words can't climb, so flatten it.
  const height = Math.min(tall, Math.round(94 + Math.max(120, width * 0.32)));
  const reduced = useReducedMotion();
  const raw = useId().replace(/:/g, "");
  const textRef = useRef(null);
  const pathRef = useRef(null);
  const offset = useRef(0);
  const hover = useRef(false);
  const visible = useRef(true);
  const fontSize = width < 640 ? 13 : compact ? 15 : 17;
  const inset = width < 640 ? 28 : Math.min(90, width * 0.06);
  const geometry = priceGeometry(prices || [], { left: inset, right: width - inset, top: 40, bottom: height - 54 });
  const marks = markedSessions(prices || []);
  const priceSize = width < 640 ? 11 : 13;
  const labels = geometry ? railLabels(geometry.points, marks, { floor: height - 30, priceSize }) : new Map();
  const copies = 3;

  useEffect(() => {
    const text = textRef.current;
    if (!text || !geometry || !quotes?.length) return;
    let frame, previous;
    const length = text.getComputedTextLength() / copies;
    const observer = new IntersectionObserver(([entry]) => { visible.current = entry.isIntersecting; });
    if (wrap.current) observer.observe(wrap.current);
    const step = (time) => {
      if (previous != null && !hover.current && visible.current && !document.hidden) {
        offset.current -= Math.min(time - previous, 64) * 0.043;
        if (offset.current <= -length) offset.current += length;
        text.querySelector("textPath")?.setAttribute("startOffset", offset.current.toFixed(1));
      }
      previous = time;
      frame = requestAnimationFrame(step);
    };
    if (!reduced) frame = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [reduced, width, quotes, prices?.length]);

  if (!geometry) return <div ref={wrap} className="m-rail m-rail-empty" style={{ height }}>{caption}</div>;
  const floor = height - 30;
  const fills = quotes?.length ? quotes : [];
  return <div ref={wrap} className="m-rail" onPointerEnter={() => { hover.current = true; }} onPointerLeave={() => { hover.current = false; }}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <defs>
        <path id={`rail-${raw}`} ref={pathRef} d={geometry.path} />
        <linearGradient id={`fill-${raw}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#B6F5C9" stopOpacity=".16" /><stop offset="1" stopColor="#B6F5C9" stopOpacity="0" /></linearGradient>
      </defs>
      {!compact && geometry.points.filter((point) => marks.has(point.index)).map((point) => <line key={point.index} x1={point.x} x2={point.x} y1={0} y2={floor} stroke="rgba(255,248,236,.06)" />)}
      <line x1={inset} x2={width - inset} y1={geometry.points[0].y} y2={geometry.points[0].y} stroke="rgba(255,248,236,.22)" strokeDasharray="4 6" />
      <path d={geometry.area(floor)} fill={`url(#fill-${raw})`} />
      <use href={`#rail-${raw}`} fill="none" stroke="#B6F5C9" strokeOpacity=".4" strokeWidth="1.5" className="m-rail-line" />
      {fills.length > 0 && <text ref={textRef} className="m-mono" fontSize={fontSize} fill="#FFF8EC" dy="-11">
        <textPath href={`#rail-${raw}`} startOffset="0">
          {Array.from({ length: copies }, (_, copy) => fills.map((item, index) => <tspan key={`${copy}-${index}`}>
            <tspan fill={CATEGORIES[item.category]?.ink || "#B6F5C9"} fontWeight="700">{item.label} </tspan>“{item.quote}” <tspan fill="#5E8C78">—— </tspan>
          </tspan>))}
        </textPath>
      </text>}
      {geometry.points.map((point) => {
        const mark = marks.get(point.index);
        const fifth = point.index === 5;
        const label = labels.get(point.index);
        return <g key={point.index} className="m-rail-point" style={{ "--i": point.index }}>
          <circle cx={point.x} cy={point.y} r={mark ? (fifth ? 7 : 5) : 2.5} fill={fifth ? "#FFB4A3" : mark ? "#FFF8EC" : "rgba(255,248,236,.5)"} stroke="#0F3B2C" strokeWidth="2" />
          {label?.price && <text x={point.x} y={label.priceY} textAnchor="middle" className="m-mono" fontSize={priceSize} fontWeight="700" fill="#FFF8EC">${point.price.toFixed(2)}</text>}
          {label?.axis && <text x={point.x} y={height - 6} textAnchor="middle" className="m-mono" fontSize="10" letterSpacing="1.2" fill="rgba(255,248,236,.45)">{mark}</text>}
        </g>;
      })}
    </svg>
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
