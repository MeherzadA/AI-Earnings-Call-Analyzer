import test from "node:test";
import assert from "node:assert/strict";
import { apiRequest } from "../src/api.js";

test("returns a successful report and preserves the request body", async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith("/analyze"));
    assert.equal(options.method, "POST");
    assert.equal(options.body, '{"ticker":"AAPL"}');
    return Response.json({ cached: true, analysis: { summary: "Existing report" } });
  };
  assert.equal((await apiRequest("/analyze", { method: "POST", body: '{"ticker":"AAPL"}' })).cached, true);
});

test("a hosting HTML response becomes a useful error", async () => {
  globalThis.fetch = async () => new Response("<html>Application loading</html>", { headers: { "content-type": "text/html" } });
  await assert.rejects(apiRequest("/history"), /starting or unavailable/);
});

test("preserves a useful missing-transcript error", async () => {
  globalThis.fetch = async () => Response.json({ detail: "No transcript found for EXAMPLE Q1 2024" }, { status: 404 });
  await assert.rejects(apiRequest("/analyze"), /No transcript found/);
});

test("network errors are readable", async () => {
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(apiRequest("/history"), /couldn't reach/);
});

test("a stalled request times out without retrying the POST", async () => {
  let calls = 0;
  globalThis.fetch = async (_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
  };
  await assert.rejects(apiRequest("/analyze", { method: "POST", timeoutMs: 5 }), /timed out/);
  assert.equal(calls, 1);
});
