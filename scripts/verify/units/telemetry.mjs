export const captures = () => ["telemetry-requests.json", "telemetry-box.json", "telemetry-page-errors.json", "telemetry-opted-out-page-errors.json"];

export function judge({ read, write, env }) {
  const { TELEMETRY_FIELDS: fields, KILL_RESULT_QUERY: query, TELEMETRY_PAUSE_MS: pauseMs, TELEMETRY_KILL_RUN_TICKS: killTicks } = env;
  const [requests, box, errors, optedOutErrors] = ["telemetry-requests.json", "telemetry-box.json", "telemetry-page-errors.json", "telemetry-opted-out-page-errors.json"].map(read);
  const page = (request) => new URL(request.headers.Referer ?? request.headers.referer ?? "http://unknown/").search;
  const beacons = requests.filter((request) => request.method === "POST" && new URL(request.url).pathname === "/t").map((request) => ({ page: page(request), summary: JSON.parse(request.postData) }));
  const configReads = requests.filter((request) => new URL(request.url).pathname === "/telemetry.json").map(page);
  write("telemetry-beacons.json", JSON.stringify(beacons, null, 2));
  const [beacon] = beacons, summary = beacon?.summary ?? {};
  const optedOutPage = box.after.search;
  const checks = {
    finishedRunSendsExactlyOneBeacon: beacons.length === 1 && beacon.page === query,
    beaconHasOnlyTheDocumentedFields: JSON.stringify(Object.keys(summary)) === fields,
    beaconDescribesTheKill: summary.end === "kill" && summary.runTicks === Number(killTicks) && summary.view === "3d" && summary.sampleRate === 1 && summary.browser === "chrome" &&
      `v${summary.version}` === box.before.version && summary.frames > 0 && summary.frameMedianMs > 0 && summary.tickMedianMs > 0 && summary.tickMaxMs >= summary.tickMedianMs,
    pauseLeftOutOfTimings: summary.tickMaxMs < Number(pauseMs) && summary.framesOver50Ms < summary.frames,
    optOutIsSavedAndShownAfterReload: box.before.checked === true && box.before.saved === null && box.after.checked === false && box.after.saved === "off" && optedOutPage !== query,
    optedOutPageReadsNoConfigAndSendsNothing: !configReads.includes(optedOutPage) && !beacons.some((sent) => sent.page === optedOutPage),
    tickingTheBoxAgainClearsTheChoice: box.restored.checked === true && box.restored.saved === null,
    noTelemetryPageErrors: errors.length === 0 && optedOutErrors.length === 0,
  };
  return { observed: {}, checks };
}
