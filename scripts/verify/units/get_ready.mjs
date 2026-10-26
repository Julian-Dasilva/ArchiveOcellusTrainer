export const captures = () => ["get-ready.json", "get-ready-log.json", "get-ready-page-errors.json"];

export function judge({ read, env }) {
  const { SPAWN_TILE: spawn, GET_READY_TICKS: readyTicks } = env;
  const [ready, log, errors] = ["get-ready.json", "get-ready-log.json", "get-ready-page-errors.json"].map(read);
  const from = JSON.parse(spawn), countdown = Number(readyTicks);
  const overlay = Object.entries(ready.overlay).map(([tick, counts]) => [Number(tick), counts]).sort(([a], [b]) => a - b);
  const firstStep = Object.entries(ready.player).map(([tick, at]) => [Number(tick), at]).sort(([a], [b]) => a - b)
    .find(([, at]) => at.x !== from.x || at.y !== from.y)?.[0] ?? null;
  const firstBossStep = log.rows[0] ? [log.rows[0].tick, log.rows[0].worldTick] : null;
  const checks = {
    getReadyRecordedFromWorldTickZero: ready.installedAt?.tick === 0,
    getReadyCountsDownOncePerWorldTick: JSON.stringify(overlay) === JSON.stringify(Array.from({ length: countdown }, (_, tick) => [tick, [countdown - tick]])),
    firstBossStepEndsGetReady: JSON.stringify(firstBossStep) === JSON.stringify([0, countdown]),
    clickDuringGetReadyWalksBeforeItEnds: ready.clickTick !== null && ready.clickTick < countdown && firstStep !== null && firstStep > ready.clickTick && firstStep < countdown,
    noGetReadyPageErrors: errors.length === 0,
  };
  return { observed: { overlay, clickTick: ready.clickTick, firstStep, firstBossStep }, checks };
}
