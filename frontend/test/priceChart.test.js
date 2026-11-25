import assert from "node:assert/strict";
import test from "node:test";
import { dateTicks, modelLabel, priceLabel, priceScale } from "../src/mth/format.js";

const prices = [341.91, 318.36, 330, 372.47, 338.2].map((price, i) => ({ date: `2026-07-2${i}`, price }));

test("price scale covers every close with round ticks", () => {
  const scale = priceScale(prices, { left: 0, right: 400, top: 0, bottom: 200 });
  assert.ok(scale.min <= 318.36 && scale.max >= 372.47);
  assert.ok(scale.ticks.every((value) => Number.isInteger(value / 10) || Number.isInteger(value / 25)));
  assert.equal(scale.points[0].x, 0);
  assert.equal(scale.points.at(-1).x, 400);
  assert.equal(priceScale(prices.slice(0, 1), { left: 0, right: 1, top: 0, bottom: 1 }), null);
});

test("date ticks always include the call day and the last day", () => {
  assert.deepEqual(dateTicks(22, 5), [0, 5, 11, 16, 21]);
  assert.deepEqual(dateTicks(2, 5), [0, 1]);
});

test("labels read as plain text", () => {
  assert.equal(priceLabel(1234.5), "$1,234.50");
  assert.equal(modelLabel("gemini-3.5-flash-lite"), "Gemini 3.5 Flash-Lite");
  assert.equal(modelLabel(null), "an AI model");
});
