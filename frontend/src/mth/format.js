// Pure presentation helpers for the "minus the hour" interface. No DOM, no React.

export const NAMES = {
  AAPL: "Apple", NVDA: "NVIDIA", PYPL: "PayPal", MSFT: "Microsoft", GOOGL: "Alphabet", GOOG: "Alphabet",
  AMZN: "Amazon", META: "Meta", TSLA: "Tesla", LITE: "Lumentum", VET: "Vermilion", VOXX: "VOXX", VARRY: "Vår Energi",
};

// Files bundled in public/logos. Anything else falls back to a monogram.
export const LOGOS = { AAPL: "apple", NVDA: "nvidia", PYPL: "paypal", MSFT: "microsoft" };

export const CATEGORIES = {
  performance: { label: "Results", bg: "#DDF6E4", fg: "#1E7A46", ink: "#B6F5C9" },
  opportunities: { label: "Opportunity", bg: "#FFF0C7", fg: "#8A5A00", ink: "#FFD98A" },
  risks: { label: "Risk", bg: "#FFE1D9", fg: "#A33A1E", ink: "#FFB4A3" },
  guidance: { label: "Guidance", bg: "#DCE8FF", fg: "#2B4C8C", ink: "#A9C8FF" },
};
export const RAIL_ORDER = ["performance", "opportunities", "risks", "guidance"];

// Curated short names first; the API's legal names ("PayPal Holdings, Inc.") lose their suffixes.
export const companyName = (ticker, names = {}) => (NAMES[ticker] || names[ticker] || ticker).trim()
  .replace(/(?:,?\s+(?:Inc|Corp|Corporation|Company|Ltd|Limited|plc|Co|Holdings|Group|N\.V|S\.A|AG|SE)\.?)+$/i, "");

export function periodLabel(item) {
  return `Q${Number(item.quarter)} FY${String(item.year).slice(-2)}`;
}

export function samePeriod(a, b) {
  return a && b && a.ticker === b.ticker && Number(a.year) === Number(b.year) && Number(a.quarter) === Number(b.quarter);
}

// Typographic minus so signed columns line up in tabular figures.
export function signedPct(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${Math.abs(number).toFixed(digits)}%`;
}

export const moveTone = (value) => value == null ? "none" : value > 0 ? "up" : value < 0 ? "down" : "flat";

export function shortDate(date, withYear = true) {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return "Date not recorded";
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

export function money(amount) {
  if (!Number.isFinite(amount)) return "—";
  const absolute = Math.abs(amount);
  const [scale, unit] = absolute >= 1e12 ? [1e12, "T"] : absolute >= 1e9 ? [1e9, "B"] : absolute >= 1e6 ? [1e6, "M"] : [1, ""];
  const digits = absolute / scale >= 100 ? 0 : 1;
  return `$${Number((absolute / scale).toFixed(digits))}${unit}`;
}

export function parseMoney(text) {
  const match = /\$\s*([\d,]*\.?\d+)\s*(trillion|billion|million|thousand|[tbmk])?\b/i.exec(text || "");
  if (!match) return null;
  const unit = (match[2] || "").toLowerCase();
  const scale = { trillion: 1e12, t: 1e12, billion: 1e9, b: 1e9, million: 1e6, m: 1e6, thousand: 1e3, k: 1e3 }[unit] || 1;
  return Number(match[1].replace(/,/g, "")) * scale;
}

// Mirrors the backend's outlook extraction: "$X to $Y billion" or "$X billion plus or minus N%".
export function parseOutlookRange(text) {
  const span = /\$([\d.]+)\s*(billion|million)?\s*(?:to|and|–|-)\s*\$?([\d.]+)\s*(billion|million)/i.exec(text || "");
  const scale = (unit) => (unit || "").toLowerCase() === "million" ? 1e6 : 1e9;
  if (span) {
    const low = Number(span[1]) * scale(span[2] || span[4]);
    const high = Number(span[3]) * scale(span[4]);
    return low <= high ? { low, high } : null;
  }
  const tolerance = /\$([\d.]+)\s*(billion|million),?\s*(?:plus or minus|\+\/-|±)\s*([\d.]+)%/i.exec(text || "");
  if (!tolerance) return null;
  const center = Number(tolerance[1]) * scale(tolerance[2]);
  const delta = center * Number(tolerance[3]) / 100;
  return { low: center - delta, high: center + delta };
}

// A quote short enough to ride a line: the first sentence, cut on a word boundary.
export function railQuote(quote, max = 96) {
  const text = (quote || "").replace(/\s+/g, " ").trim();
  const sentence = text.match(/^.+?[.!?](?=\s|$)/)?.[0] || text;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[,;:]$/, "")}…`;
}

// One quote per category, in the signature order, from findings that carry citations.
export function railQuotes(findings = []) {
  const quotes = [];
  for (const category of RAIL_ORDER) {
    const finding = findings.find((item) => item.category === category && item.citations?.[0]?.quote);
    if (finding) quotes.push({ category, label: CATEGORIES[category].label.toUpperCase(), quote: railQuote(finding.citations[0].quote), findingId: finding.id });
  }
  if (!quotes.length) return [];
  // Top up to four with further findings so a thin report still has words on its line.
  for (const finding of findings) {
    if (quotes.length >= 4) break;
    if (finding.citations?.[0]?.quote && !quotes.some((item) => item.findingId === finding.id)) {
      quotes.push({ category: finding.category, label: CATEGORIES[finding.category]?.label.toUpperCase() || "NOTE", quote: railQuote(finding.citations[0].quote), findingId: finding.id });
    }
  }
  return quotes;
}

// Smooth price line: a monotone cubic, flat at each high and low as in the design, but without
// a flat step at every close, so text riding the line doesn't bunch up at each day.
export function priceGeometry(prices, { left, right, top, bottom }) {
  const values = prices.map((item) => item.price).filter(Number.isFinite);
  if (values.length < 2) return null;
  const high = Math.max(...values), low = Math.min(...values);
  const spread = high - low || 1;
  const x = (index) => +(left + index * (right - left) / (values.length - 1)).toFixed(1);
  const y = (price) => +(top + (high - price) / spread * (bottom - top)).toFixed(1);
  const points = values.map((price, index) => ({ x: x(index), y: y(price), price, index }));
  const slopes = points.slice(1).map((point, i) => (point.y - points[i].y) / (point.x - points[i].x));
  const tangents = points.map((_, i) => {
    if (i === 0 || i === points.length - 1) return 0;
    const [before, after] = [slopes[i - 1], slopes[i]];
    return before * after <= 0 ? 0 : 2 / (1 / before + 1 / after);
  });
  let path = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], third = (b.x - a.x) / 3;
    path += ` C${+(a.x + third).toFixed(1)} ${+(a.y + tangents[i - 1] * third).toFixed(1)} ${+(b.x - third).toFixed(1)} ${+(b.y - tangents[i] * third).toFixed(1)} ${b.x} ${b.y}`;
  }
  return { points, path, high, low, y, area: (floor) => `${path} L${points.at(-1).x} ${floor} L${points[0].x} ${floor} Z` };
}

// Which closes get a price label: call day, +1, +5, the low, the high, and the last.
export function markedSessions(prices) {
  const marks = new Map();
  if (!prices.length) return marks;
  const values = prices.map((item) => item.price);
  const last = prices.length - 1;
  marks.set(0, "CALL DAY");
  if (last >= 1) marks.set(1, "+1 DAY");
  if (last >= 5) marks.set(5, "+5 DAYS");
  if (last > 6) {
    const low = values.indexOf(Math.min(...values.slice(1)));
    const high = values.indexOf(Math.max(...values.slice(1)));
    if (!marks.has(low)) marks.set(low, "LOW");
    if (!marks.has(high)) marks.set(high, "HIGH");
  }
  if (!marks.has(last)) marks.set(last, `+${last}`);
  return marks;
}

export function returnAt(report, prices, session) {
  if (session === 1 && report.return_1day != null) return report.return_1day;
  if (session === 5 && report.return_5day != null) return report.return_5day;
  const base = prices[0]?.price, close = prices[session]?.price;
  return base > 0 && close > 0 ? (close / base - 1) * 100 : null;
}

// Citation offsets are Unicode code points over the whole transcript; DOM strings are UTF-16.
export function markRange(passage, citation) {
  if (!passage || !citation) return null;
  if (Number.isInteger(citation.start) && Number.isInteger(citation.end) && citation.start >= passage.start && citation.end <= passage.end) {
    const characters = Array.from(passage.text);
    return [characters.slice(0, citation.start - passage.start).join("").length, characters.slice(0, citation.end - passage.start).join("").length];
  }
  const found = passage.text.indexOf(citation.quote);
  return found === -1 ? null : [found, found + citation.quote.length];
}

// The API's highlight_periods maps each figure to "quarter", "annual" or "unconfirmed".
// Older saved reports have no map, and then no tag is shown.
export function highlightPeriod(report, metric) {
  const periods = report?.highlight_periods ?? report?.research?.highlight_periods;
  const raw = Array.isArray(periods) ? periods.find((item) => item?.id === metric.id)?.status
    : periods && typeof periods === "object" ? periods[metric.id] : metric.period;
  const value = typeof raw === "object" && raw ? raw.status : raw;
  if (value === false || /^(unconfirmed|unknown|not_confirmed|ambiguous)$/i.test(String(value))) return "unconfirmed";
  if (/^(annual|full_year)$/i.test(String(value))) return "annual";
  if (value === true || /^(quarter|confirmed|current|this_quarter|reporting_period)$/i.test(String(value))) return "confirmed";
  return null;
}

// The hero's one-sentence answer: the promise-vs-delivery result when there is one.
export function shortVersion(report) {
  const comparison = report.context?.comparison;
  const low = Number(comparison?.outlook?.low), high = Number(comparison?.outlook?.high);
  const actual = parseMoney(comparison?.reported?.value || comparison?.actual);
  if (comparison?.status === "compared" && Number.isFinite(low) && Number.isFinite(high) && Number.isFinite(actual)) {
    if (actual > high) return { before: "Revenue landed ", mark: `${money(actual - high)} above`, after: " the top of the range management gave last quarter." };
    if (actual < low) return { before: "Revenue landed ", mark: `${money(low - actual)} below`, after: " the bottom of the range management gave last quarter." };
    return { before: "Revenue landed ", mark: "inside", after: " the range management gave last quarter." };
  }
  if (comparison?.status === "directional" && comparison.headline) {
    const match = /(as forecast|against the forecast direction|after an outlook of little change)/i.exec(comparison.headline);
    return match ? { before: `${comparison.headline.slice(0, match.index)}`, mark: match[1], after: `${comparison.headline.slice(match.index + match[1].length)}.` } : { before: `${comparison.headline}.`, mark: "", after: "" };
  }
  const lead = report.research?.findings?.find((item) => item.citations?.length);
  return lead ? { before: lead.headline.replace(/\.?$/, "."), mark: "", after: "" } : null;
}

// Range chart for promise vs. delivery: last call's range vs. reported, plus this call's next range.
export function promiseChart(report) {
  const comparison = report.context?.comparison;
  const low = Number(comparison?.outlook?.low), high = Number(comparison?.outlook?.high);
  const actual = parseMoney(comparison?.reported?.value || comparison?.actual);
  const prior = comparison?.status === "compared" && Number.isFinite(low) && Number.isFinite(high) ? { low, high, actual: Number.isFinite(actual) ? actual : null } : null;
  const guidance = (report.research?.findings || []).filter((item) => item.category === "guidance");
  let next = null;
  for (const finding of guidance) {
    for (const citation of finding.citations || []) {
      const range = parseOutlookRange(citation.quote);
      if (range && (!prior || (range.high > prior.low * 0.5 && range.low < prior.high * 2))) { next = { ...range, citation, findingId: finding.id }; break; }
    }
    if (next) break;
  }
  if (!prior && !next) return null;
  const values = [prior?.low, prior?.high, prior?.actual, next?.low, next?.high].filter(Number.isFinite);
  const span = Math.max(...values) - Math.min(...values) || Math.max(...values) * 0.1;
  const step = niceStep(span / 5);
  const min = Math.floor((Math.min(...values) - span * 0.15) / step) * step;
  const max = Math.ceil((Math.max(...values) + span * 0.15) / step) * step;
  const ticks = [];
  for (let value = min; value <= max + step / 2; value += step) ticks.push(value);
  return { prior, next, min, max, ticks };
}

function niceStep(raw) {
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((n) => n * power).find((n) => n >= raw) || 10 * power;
}

export function newsTitle(item) {
  const suffix = ` - ${item.source}`;
  return item.title?.endsWith(suffix) ? item.title.slice(0, -suffix.length) : item.title;
}

export function receiptHash(hash) {
  return hash ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : "—";
}

export function filterLibrary(history, filter, query = "", names = {}) {
  const needle = query.trim().toLowerCase();
  return history.filter((item) => {
    if (filter === "fell" && !(item.return_1day < 0)) return false;
    if (filter === "rose" && !(item.return_1day > 0)) return false;
    if (!needle) return true;
    return `${item.ticker} ${companyName(item.ticker, names)} ${periodLabel(item)} q${item.quarter} ${item.year}`.toLowerCase().includes(needle);
  });
}
