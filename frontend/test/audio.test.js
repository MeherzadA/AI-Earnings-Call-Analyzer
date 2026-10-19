import test from "node:test";
import assert from "node:assert/strict";
import { audioTime, callAudioUrl, speechSections } from "../src/audio.js";

test("audio uses the requested fiscal period and only the free provider's supported companies", () => {
  const url = new URL(callAudioUrl({ ticker: "AAPL", year: 2024, quarter: 1 }));
  assert.equal(url.searchParams.get("year"), "2024");
  assert.equal(url.searchParams.get("quarter"), "1");
  assert.equal(url.searchParams.get("symbol"), "AAPL");
  assert.ok(callAudioUrl({ ticker: "MSFT", year: 2024, quarter: 2 }));
  assert.equal(callAudioUrl({ ticker: "NVDA", year: 2024, quarter: 4 }), null);
  assert.equal(audioTime(3665), "1:01:05");
  assert.equal(audioTime(NaN), "0:00");
});

test("read-aloud preserves transcript words and passage identity in short sections", () => {
  const text = "Sales increased 10% to $2.1 billion. ".repeat(20).trim();
  const sections = speechSections([{ id: "P4", text }, { id: "P5", text: "" }]);
  assert.ok(sections.length > 1);
  assert.ok(sections.every((item) => item.text.length <= 240 && item.passageId === "P4"));
  assert.equal(sections.map((item) => item.text).join(" "), text);
});
