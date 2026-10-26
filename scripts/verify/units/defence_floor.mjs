import { sameJson } from "../lib.mjs";

export const captures = () => [
  "defence-floor-start.json", "defence-floor-first.json", "defence-floor.json", "defence-floor-log.json", "defence-floor.png", "defence-floor-console.log", "defence-floor-page-errors.json",
];

export function judge({ read, env }) {
  const { DEFENCE_FLOOR_STEPS: floorSteps } = env;
  const [floorStart, floorFirst, floorLast, floorLog] = ["defence-floor-start.json", "defence-floor-first.json", "defence-floor.json", "defence-floor-log.json"].map(read);
  const floorGlaives = floorLog.rows.flatMap((row) => row.events.filter((event) => event.kind === "player-hit-judged")).slice(0, 4);
  const observed = {
    defenceFloor: {
      bossDefence: [floorStart.boss.defence, floorFirst.boss.defence, floorLast.boss.defence],
      glaives: floorGlaives.map((event) => [event.at, event.outcome, event.requested]),
    },
  };
  const checks = {
    divisionStopsAtDefenceFloor: sameJson(observed.defenceFloor.bossDefence, floorSteps) && floorGlaives.length === 4 && floorGlaives.every((event) => (event.outcome === "passed" || event.outcome === "reduced") && event.requested > 0),
  };
  return { observed, checks };
}
