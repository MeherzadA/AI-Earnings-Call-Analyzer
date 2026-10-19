import test from "node:test";
import assert from "node:assert/strict";
import { reportIdFromSearch, reportUrl } from "../src/reportNavigation.js";
import { reportContent, callDateLabel, marketWindow, priceSeries } from "../src/reportPresentation.js";

test("only positive integer report links can trigger a saved-report read", () => {
  assert.equal(reportIdFromSearch("?report=9"), 9);
  for (const search of ["", "?report=0", "?report=-1", "?report=1e3", "?report=bad", "?report=99999999999999999999"]) assert.equal(reportIdFromSearch(search), null);
});

test("share links preserve unrelated parameters and replace the prior report", () => {
  const url = reportUrl("https://example.com/?report=2&utm_source=github#old", 9);
  assert.equal(url, "https://example.com/?report=9&utm_source=github");
});

test("older stored statements use the current card model without invented evidence", () => {
  const analysis = { sentiment: "positive", key_claims: ["Revenue increased 10%."], red_flags: ["Demand is uncertain."], opportunities: [] };
  const result = reportContent({ analysis });
  assert.deepEqual(result.findings.map((item) => item.category), ["performance", "risks"]);
  assert.ok(result.findings.every((item) => item.citations.length === 0));
  assert.equal(analysis.key_claims[0], "Revenue increased 10%.");
  assert.equal(callDateLabel("2025-11-19"), "Nov 19, 2025");
  assert.equal(callDateLabel(null), "Date not recorded");
  assert.match(marketWindow({daily_prices:[{date:"2025-11-19",price:186.52},{date:"2025-11-20",price:180.64}]}), /Nov 19, 2025 close \(\$186.52\).*Nov 20, 2025 close \(\$180.64\)/);
  const points = priceSeries({daily_prices:[{price:100},{price:120},{price:110}],return_1day:19.99});
  assert.equal(points[0].change,0);
  assert.equal(points[1].change,19.99);
  assert.ok(Math.abs(points[2].change-10)<1e-9);
  assert.deepEqual(priceSeries({daily_prices:[{price:0}]}),[]);
});
