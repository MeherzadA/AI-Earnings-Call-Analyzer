import test from "node:test";
import assert from "node:assert/strict";
import { audioTime, callAudioUrl } from "../src/audio.js";

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
