export function callDateLabel(date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return "Date not recorded";
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Display only findings that carry their supporting source excerpts.
export function reportContent(result) {
  const research = result.research || { management_tone: "unavailable", findings: [], financial_highlights: [] };
  return { ...research,
    findings: research.findings.filter((item) => item.citations?.length),
    financial_highlights: research.financial_highlights.filter((item) => item.citations?.length),
  };
}

export function marketWindow(result) {
  const prices = result.daily_prices || [];
  if (!prices[0] || !prices[1]) return "The chart uses regular-session closing prices, not after-hours or intraday moves.";
  return `${callDateLabel(prices[0].date)} close ($${prices[0].price.toFixed(2)}) → ${callDateLabel(prices[1].date)} close ($${prices[1].price.toFixed(2)}). After-hours and intraday prices are not shown.`;
}

export function priceSeries(result) {
  const prices = result.daily_prices || [];
  if (!(prices[0]?.price > 0)) return [];
  return prices.map((item, index) => ({ ...item, session: index ? `Day ${index}` : "Call day", change: (index === 1 ? result.return_1day : index === 5 ? result.return_5day : null) ?? (item.price / prices[0].price - 1) * 100 }));
}

// ponytail: curated, sourced facts; use a listing-status feed if broad live coverage is needed.
const LISTING_NOTICES = {
  VOXX: {
    title: "VOXX was acquired by Gentex",
    text: "Gentex acquired VOXX on April 1, 2025. At closing, VOXX requested Nasdaq trading suspension and delisting. Past earnings calls can still be available even when Yahoo no longer returns the ticker’s historical prices.",
    source: "VOXX acquisition notice",
    url: "https://www.sec.gov/Archives/edgar/data/807707/000110465925030414/tm2510680d5_ex99-1.htm",
    checked: "2026-10-23",
  },
  VARRY: {
    title: "VARRY is Vår Energi’s U.S. ADR",
    text: "An ADR is a U.S. receipt representing shares in a foreign company. VARRY trades over the counter in the U.S.; Citi listed its ADR program as active when checked. The earnings call is held by Vår Energi, the Norwegian company.",
    source: "Citi ADR record",
    url: "https://depositaryreceipts.citi.com/adr/guides/estfee.aspx?cusip=92212W100&pageId=15&subpageID=114",
    checked: "2026-10-23",
  },
};

export function listingNotice(ticker) {
  return LISTING_NOTICES[ticker] || null;
}
