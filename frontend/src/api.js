const API_BASE = (import.meta.env?.VITE_API_BASE_URL || "https://earnings-analyzer-er72.onrender.com").replace(/\/+$/, "");

export async function streamAnalysis(period, onEvent) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  let reader;
  try {
    const response = await fetch(`${API_BASE}/analyze/stream`, {
      method: "POST", headers: {"Content-Type":"application/json", Accept:"text/event-stream"},
      body: JSON.stringify({...period, with_research:true}), signal: controller.signal,
    });
    if (!response.ok) {
      const error = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
      throw new Error(error?.detail || "The analysis service is starting or unavailable. Please try again shortly.");
    }
    if (!response.headers.get("content-type")?.includes("text/event-stream") || !response.body) {
      throw new Error("The analysis connection could not be opened. Please try again shortly.");
    }
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", report;
    function consume(block) {
      const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      if (!data) return;
      const event = JSON.parse(data);
      if (event.type === "error") throw new Error(event.detail || "This analysis could not finish. Please try again.");
      if (event.type === "report") report = event.report;
      onEvent(event);
    }
    while (true) {
      const {done, value} = await reader.read();
      buffer = (buffer + decoder.decode(value, {stream: !done})).replace(/\r\n/g, "\n");
      let end;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        consume(buffer.slice(0, end)); buffer = buffer.slice(end + 2);
      }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (!report) throw new Error("The connection ended before the report was saved. Please try again; completed reports reopen directly.");
    return report;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("This analysis timed out. You can still read any transcript already loaded.");
    if (error instanceof TypeError) throw new Error("The analysis connection was interrupted. Please try again shortly.");
    if (error instanceof SyntaxError) throw new Error("The analysis connection returned an incomplete response. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
    if (reader) await reader.cancel().catch(() => {});
  }
}

export async function apiRequest(path, { timeoutMs = 180000, ...options } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...options, signal: controller.signal });
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("The analysis service is starting or unavailable. Please try again shortly.");
    }
    const data = await response.json();
    if (!response.ok) {
      throw new Error(typeof data.detail === "string" ? data.detail : "That report could not be loaded. Please check the company and period.");
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("The request timed out. Please try again in a moment; the service may still be starting.");
    }
    if (error instanceof TypeError) {
      throw new Error("We couldn't reach the analysis service. Please try again shortly.");
    }
    if (error instanceof SyntaxError) {
      throw new Error("The service returned an incomplete response. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
