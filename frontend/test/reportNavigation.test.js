import test from "node:test";
import assert from "node:assert/strict";
import { reportIdFromSearch, reportUrl, nextSavedReport } from "../src/reportNavigation.js";

test("only positive integer report links can trigger a saved-report read", () => {
  assert.equal(reportIdFromSearch("?report=9"), 9);
  for (const search of ["", "?report=0", "?report=-1", "?report=1e3", "?report=bad", "?report=99999999999999999999"]) assert.equal(reportIdFromSearch(search), null);
});

test("share links preserve unrelated parameters and replace the prior report", () => {
  const url = reportUrl("https://example.com/?report=2&utm_source=github#old", 9);
  assert.equal(url, "https://example.com/?report=9&utm_source=github");
});

test("saved-call browsing wraps the available reports and handles an empty archive", () => {
  const reports = [{ report_id: 18 }, { report_id: 11 }, { report_id: 16 }];
  assert.equal(nextSavedReport(reports, 16).report_id, 18);
  assert.equal(nextSavedReport(reports, 18, -1).report_id, 16);
  assert.equal(nextSavedReport(reports, 999).report_id, 18);
  assert.equal(nextSavedReport([], 18), null);
});
