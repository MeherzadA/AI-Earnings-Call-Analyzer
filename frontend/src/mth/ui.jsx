import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CATEGORIES, LOGOS, companyName, priceGeometry } from "./format.js";

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

export function QuoteRail({ prices, height: tall = 340, label }) {
  const [wrap, width] = useElementWidth(1200);
  const height = Math.min(tall, Math.round(94 + Math.max(120, width * 0.32)));
  const inset = width < 640 ? 20 : Math.min(60, width * 0.06);
  const geometry = priceGeometry(prices || [], { left: inset, right: width - inset, top: 24, bottom: height - 24 });
  if (!geometry) return <div ref={wrap} className="m-rail m-rail-empty" style={{ height }} role="img" aria-label={label} />;
  return <div ref={wrap} className="m-rail">
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={geometry.path} fill="none" stroke="#B6F5C9" strokeWidth="2" strokeLinecap="round" />
      <circle cx={geometry.points.at(-1).x} cy={geometry.points.at(-1).y} r="4" fill="#B6F5C9" />
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
