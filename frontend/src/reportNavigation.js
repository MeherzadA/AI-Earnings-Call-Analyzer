export function reportIdFromSearch(search) {
  const id = new URLSearchParams(search).get("report");
  return id && /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null;
}

export function reportUrl(base, id) {
  const url = new URL(base);
  url.searchParams.set("report", String(id));
  url.hash = "";
  return url.toString();
}

export function nextSavedReport(reports, currentId, step = 1) {
  if (!reports.length) return null;
  const index = reports.findIndex((item) => item.report_id === currentId);
  if (index < 0) return reports[step < 0 ? reports.length - 1 : 0];
  return reports[(index + step + reports.length) % reports.length];
}
