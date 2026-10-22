export function animateStockStrip(calls) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canHover = window.matchMedia("(hover: hover)");
  let frame, previous = null, position = calls.scrollLeft, written = position, direction = 1, resumeAt = 0;
  function scrollCalls(time) {
    const end = Math.max(0, calls.scrollWidth - calls.clientWidth);
    // Follow manual scrolling, including scrollbar drags and touch momentum.
    if (Math.abs(calls.scrollLeft - written) > 1) resumeAt = time + 800;
    if (reducedMotion.matches || (canHover.matches && calls.matches(":hover")) || calls.querySelector(":focus-visible") || time < resumeAt) {
      position = calls.scrollLeft;
    } else if (previous !== null && end > 0) {
      position = Math.max(0, Math.min(end, position + direction * Math.min(time - previous, 64) * 0.025));
      calls.scrollLeft = position;
      if (position === 0 || position === end) direction *= -1;
    }
    written = calls.scrollLeft;
    previous = time;
    frame = requestAnimationFrame(scrollCalls);
  }
  frame = requestAnimationFrame(scrollCalls);
  return () => cancelAnimationFrame(frame);
}
