import assert from "node:assert/strict";
import test from "node:test";
import { logoSources, publisherIcon } from "../src/mth/format.js";

test("bundled logos come first, then CDN fallbacks for any ticker", () => {
  assert.equal(logoSources("AAPL")[0], "/logos/apple.svg");
  const goog = logoSources("goog");
  assert.equal(goog.length, 2);
  assert.match(goog[0], /image-stock\/GOOG\.png$/);
  assert.deepEqual(logoSources(""), []);
});

test("publisher icons use bundled marks by name, then the feed's site favicon", () => {
  assert.equal(publisherIcon({ source: "Reuters" }), "/publishers/reuters.png");
  assert.equal(publisherIcon({ source: "The Wall Street Journal" }), "/publishers/wsj.png");
  assert.match(publisherIcon({ source: "ETF Database", site: "https://etfdb.com" }), /favicons\?domain=etfdb\.com/);
  assert.equal(publisherIcon({ source: "Unknown" }), null);
});
