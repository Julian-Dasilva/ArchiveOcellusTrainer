export const captures = () => ["load-retry-asset.txt", "load-retry.har", "load-retry.json", "load-retry.png", "load-favicon-requests.json", "load-retry-page-errors.json"];

export function judge({ read, text }) {
  const file = text("load-retry-asset.txt").trim();
  const attempts = read("load-retry.har").log.entries.filter((entry) => entry.request.url.endsWith(`/osrs-assets/${file}`)).map((entry) => entry.response.status);
  const [page, favicon, errors] = ["load-retry.json", "load-favicon-requests.json", "load-retry-page-errors.json"].map(read);
  const checks = {
    droppedBossAssetRetried: attempts.length >= 2 && attempts[0] === 0 && attempts[attempts.length - 1] === 200,
    trainerLoadsAfterTheDrop: page.tick >= 8 && !page.text.includes("Loading failed"),
    noFaviconRequest: favicon.length === 0,
    noLoadRetryPageErrors: errors.length === 0,
  };
  return { observed: { attempts, favicon: favicon.map((request) => request.url) }, checks };
}
