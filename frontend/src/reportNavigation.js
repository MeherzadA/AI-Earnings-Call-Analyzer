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
