import test from "node:test";
import assert from "node:assert/strict";
import { animateStockStrip } from "../src/stockStrip.js";

test("stock strip resumes from a manual scroll and only pauses during interaction", () => {
  const saved = { window: globalThis.window, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  let nextFrame, frameId = 0, cancelled, hovered = false, keyboardFocus = false;
  const reducedMotion = { matches: false }, canHover = { matches: true };
  const calls = { scrollLeft: 0, scrollWidth: 1000, clientWidth: 250,
    matches: () => hovered, querySelector: () => keyboardFocus ? {} : null };
  globalThis.window = { matchMedia: (query) => query.includes("reduced-motion") ? reducedMotion : canHover };
  globalThis.requestAnimationFrame = (callback) => { nextFrame = callback; return ++frameId; };
  globalThis.cancelAnimationFrame = (id) => { cancelled = id; };
  try {
    const stop = animateStockStrip(calls);
    nextFrame(0); nextFrame(16);
    assert.ok(calls.scrollLeft > 0, "starts automatically");

    hovered = true;
    calls.scrollLeft = 400;
    nextFrame(32); nextFrame(900);
    assert.equal(calls.scrollLeft, 400, "scrollbar dragging keeps the user's position");
    hovered = false;
    nextFrame(916);
    assert.ok(calls.scrollLeft > 400, "leaving the scrollbar resumes at its new position");

    calls.scrollLeft = 500;
    nextFrame(932); nextFrame(1200);
    assert.equal(calls.scrollLeft, 500, "touch or wheel scrolling gets time to settle");
    nextFrame(1800);
    assert.ok(calls.scrollLeft > 500, "manual scrolling never pauses permanently");

    keyboardFocus = true;
    const focusedPosition = calls.scrollLeft;
    nextFrame(1816);
    assert.equal(calls.scrollLeft, focusedPosition, "keyboard selection stays still");
    keyboardFocus = false;
    nextFrame(1832);
    assert.ok(calls.scrollLeft > focusedPosition, "leaving keyboard focus resumes scrolling");

    reducedMotion.matches = true;
    const stillPosition = calls.scrollLeft;
    nextFrame(1848);
    assert.equal(calls.scrollLeft, stillPosition, "respects reduced motion");
    reducedMotion.matches = false;
    canHover.matches = false;
    hovered = true;
    nextFrame(1864);
    assert.ok(calls.scrollLeft > stillPosition, "touch hover does not get stuck");
    stop();
    assert.equal(cancelled, frameId, "unmount cancels the animation");
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
