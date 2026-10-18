const API_BASE = (import.meta.env?.VITE_API_BASE_URL || "https://earnings-analyzer-er72.onrender.com").replace(/\/+$/, "");

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
