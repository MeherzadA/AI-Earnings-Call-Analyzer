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

export function preferredVoice(voices) {
  const english = voices.filter((voice) => /^en(?:-|$)/i.test(voice.lang));
  const score = (voice) => (/natural|neural|enhanced|premium/i.test(voice.name) ? 100 : /Google/i.test(voice.name) ? 50 : 0) + (voice.default ? 5 : 0);
  return english.sort((a, b) => score(b) - score(a))[0] || null;
}

export function speechSections(passages) {
  return passages.flatMap((passage) => {
    const sections = [];
    let start = null;
    let end = 0;
    for (const word of passage.text.matchAll(/\S+/g)) {
      if (start !== null && word.index + word[0].length - start > 240) {
        sections.push({ text: passage.text.slice(start, end), passageId: passage.id, start, end });
        start = null;
      }
      if (start === null) start = word.index;
      end = word.index + word[0].length;
    }
    if (start !== null) sections.push({ text: passage.text.slice(start, end), passageId: passage.id, start, end });
    return sections;
  });
}
