export function callAudioUrl({ ticker, year, quarter }) {
  if (!["AAPL", "MSFT"].includes(ticker)) return null;
  // The provider publishes this reserved demo key; it is not a private account key.
  const query = new URLSearchParams({ apikey: "demo", exchange: "NASDAQ", symbol: ticker, year, quarter });
  return `https://api.earningscall.dev/audio?${query}`;
}

export function audioTime(seconds) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, "0");
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}
