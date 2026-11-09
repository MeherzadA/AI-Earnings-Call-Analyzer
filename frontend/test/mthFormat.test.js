import assert from "node:assert/strict";
import test from "node:test";
import {
  companyName, filterLibrary, highlightPeriod, markRange, markedSessions, money, parseMoney, parseOutlookRange,
  periodLabel, priceGeometry, promiseChart, railQuote, railQuotes, samePeriod, shortVersion, signedPct,
} from "../src/mth/format.js";

test("labels periods and matches them across string and number quarters", () => {
  assert.equal(periodLabel({ year: 2026, quarter: "2" }), "Q2 FY26");
  assert.ok(samePeriod({ ticker: "NVDA", year: "2026", quarter: "2" }, { ticker: "NVDA", year: 2026, quarter: 2 }));
  assert.ok(!samePeriod({ ticker: "NVDA", year: 2026, quarter: 2 }, { ticker: "AAPL", year: 2026, quarter: 2 }));
});

test("formats signed moves with a typographic minus", () => {
  assert.equal(signedPct(-3.456), "−3.46%");
  assert.equal(signedPct(1.2, 1), "+1.2%");
  assert.equal(signedPct(0), "0.00%");
  assert.equal(signedPct(null), "—");
});

test("reads and writes dollar amounts", () => {
  assert.equal(parseMoney("revenue of $46.7 billion"), 46.7e9);
  assert.equal(parseMoney("$1,250 million"), 1.25e9);
  assert.equal(parseMoney("no money here"), null);
  assert.equal(money(46.7e9), "$46.7B");
  assert.equal(money(820e6), "$820M");
});

test("parses outlook ranges the way the backend does", () => {
  assert.deepEqual(parseOutlookRange("revenue is expected to be $54.0 billion, plus or minus 2%"), { low: 52.92e9, high: 55.08e9 });
  assert.deepEqual(parseOutlookRange("between $89 billion and $93 billion"), { low: 89e9, high: 93e9 });
  assert.equal(parseOutlookRange("we expect growth"), null);
});

test("converts code point citation offsets into UTF-16 ranges", () => {
  const passage = { start: 100, end: 120, text: "Rev 😀 grew fast" };
  const range = markRange(passage, { start: 106, end: 110, quote: "grew" });
  assert.equal(passage.text.slice(...range), "grew");
  assert.deepEqual(markRange({ start: 0, end: 9, text: "abc quote" }, { quote: "quote" }), [4, 9]);
  assert.equal(markRange({ start: 0, end: 3, text: "abc" }, { quote: "zzz" }), null);
});

test("shows a period tag only when the report says so", () => {
  const metric = { id: "H1" };
  assert.equal(highlightPeriod({}, metric), null);
  assert.equal(highlightPeriod({ highlight_periods: { H1: "unconfirmed" } }, metric), "unconfirmed");
  assert.equal(highlightPeriod({ highlight_periods: [{ id: "H1", status: "confirmed" }] }, metric), "confirmed");
  assert.equal(highlightPeriod({ highlight_periods: { H1: { status: false } } }, metric), "unconfirmed");
  // The live API puts the map on the report itself, valued quarter / annual / unconfirmed.
  assert.equal(highlightPeriod({ highlight_periods: { H1: "quarter" }, research: {} }, metric), "confirmed");
  assert.equal(highlightPeriod({ highlight_periods: { H1: "annual" }, research: {} }, metric), "annual");
});

test("prefers curated short names and trims legal suffixes from the API's", () => {
  assert.equal(companyName("NVDA", { NVDA: "NVIDIA Corporation" }), "NVIDIA");
  assert.equal(companyName("TSLA", { TSLA: "Tesla, Inc. " }), "Tesla");
  assert.equal(companyName("XYZ", { XYZ: "Block Holdings, Inc." }), "Block");
  assert.equal(companyName("ZZZ"), "ZZZ");
});

test("picks one rail quote per category, cut to a sentence", () => {
  const findings = [
    { id: "F1", category: "risks", citations: [{ quote: "Supply is tight. More words follow." }] },
    { id: "F2", category: "performance", citations: [{ quote: "Record revenue." }] },
    { id: "F3", category: "risks", citations: [{ quote: "Another risk." }] },
  ];
  const quotes = railQuotes(findings);
  assert.deepEqual(quotes.map((item) => item.findingId), ["F2", "F1", "F3"]);
  assert.equal(quotes[1].quote, "Supply is tight.");
  assert.ok(railQuote("word ".repeat(60), 40).endsWith("…"));
});

test("draws a smooth price path and marks the sessions that matter", () => {
  const prices = [100, 98, 97, 103, 101, 99, 104, 102].map((price) => ({ price }));
  const geometry = priceGeometry(prices, { left: 0, right: 70, top: 0, bottom: 100 });
  assert.equal(geometry.points.length, 8);
  assert.equal(geometry.points[6].y, 0);
  assert.ok(geometry.path.startsWith("M0 "));
  assert.equal(priceGeometry([{ price: 1 }], { left: 0, right: 1, top: 0, bottom: 1 }), null);
  const marks = markedSessions(prices);
  assert.equal(marks.get(0), "CALL DAY");
  assert.equal(marks.get(5), "+5 DAYS");
  assert.equal(marks.get(2), "LOW");
  assert.equal(marks.get(6), "HIGH");
  assert.equal(marks.get(7), "+7");
});

test("builds the promise chart and the one-line answer from a comparison", () => {
  const report = {
    context: { comparison: { status: "compared", outlook: { low: "44100000000", high: "45900000000" }, reported: { value: "$46.7 billion" } } },
    research: { findings: [{ id: "F4", category: "guidance", headline: "Next quarter", citations: [{ quote: "Revenue is expected to be $54.0 billion, plus or minus 2%." }] }] },
  };
  const chart = promiseChart(report);
  assert.equal(chart.prior.actual, 46.7e9);
  assert.equal(chart.next.findingId, "F4");
  assert.ok(chart.min <= 44.1e9 && chart.max >= 55.08e9);
  const short = shortVersion(report);
  assert.equal(short.mark, "$800M above");
  assert.equal(promiseChart({ context: {}, research: { findings: [] } }), null);
});

test("filters the library by move and by name", () => {
  const history = [
    { ticker: "NVDA", year: 2026, quarter: 2, return_1day: -3 },
    { ticker: "AAPL", year: 2026, quarter: 3, return_1day: 1 },
    { ticker: "MSFT", year: 2024, quarter: 2, return_1day: null },
  ];
  assert.deepEqual(filterLibrary(history, "fell").map((item) => item.ticker), ["NVDA"]);
  assert.deepEqual(filterLibrary(history, "rose").map((item) => item.ticker), ["AAPL"]);
  assert.deepEqual(filterLibrary(history, "all", "apple").map((item) => item.ticker), ["AAPL"]);
  assert.deepEqual(filterLibrary(history, "all", "q2 fy24").map((item) => item.ticker), ["MSFT"]);
});
