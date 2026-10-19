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
