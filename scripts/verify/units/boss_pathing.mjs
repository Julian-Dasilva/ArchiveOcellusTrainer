import { same, sameJson, walkOrders, walkPaces } from "../lib.mjs";

export const captures = () => [
  "tile-clicks.jsonl", "pathing-around.png", "pathing.json", "pathing-console.log", "pathing-page-errors.json", "pathing-reroute.json", "pathing-reroute-console.log",
  "pathing-reroute-page-errors.json", "pathing-control.json", "pathing-control-console.log", "pathing-control-page-errors.json", "pathing-out.png", "pathing-out.json",
  "pathing-out-console.log", "pathing-out-page-errors.json",
];

export function judge({ read, env }) {
  const { PATHING_WEST_TILE: pathingWest, PATHING_EAST_TILE: pathingEast, PATHING_BACK_TILE: pathingBack, PATHING_EXPECTED: pathingExpected,
    PATHING_REROUTE_EXPECTED: pathingRerouteExpected, PATHING_OUT_EXPECTED: pathingOutExpected, PATHING_CONTROL_EXPECTED: pathingControlExpected } = env;
  const pathingLog = read("pathing.json");
  const [rerouteLog, outLog] = ["pathing-reroute.json", "pathing-out.json"].map(read);
  const controlRerouteLog = read("pathing-control.json");
  const orderTicks = (log) => log.rows.filter((row) => row.inputs.some((i) => i.kind === "walk-ordered")).map((row) => row.tick);
  const walks = (log) => {
    const starts = log.rows.flatMap((row, i) => (row.inputs.some((input) => input.kind === "walk-ordered") ? [i] : []));
    return starts.map((start, n) => {
      const tiles = log.rows.slice(start, starts[n + 1]).map((row) => row.playerAtPostTick.tile);
      return [log.rows[start].phase.stage, tiles.filter((at, i) => i === 0 || !same(at, tiles[i - 1]))];
    });
  };
  const observed = {
    pathing: { orders: walkOrders(pathingLog), walks: walks(pathingLog) },
    pathingReroute: { orders: walkOrders(rerouteLog), orderTicks: orderTicks(rerouteLog), walks: walks(rerouteLog) },
    pathingOut: { orders: walkOrders(outLog), orderTicks: orderTicks(outLog), walks: walks(outLog) },
    pathingControl: { orders: walkOrders(controlRerouteLog), paces: walkPaces(controlRerouteLog), orderTicks: orderTicks(controlRerouteLog), walks: walks(controlRerouteLog) },
  };
  const checks = {
    bossBlocksOnlyInOuterVoid: sameJson(observed.pathing.orders, `[${pathingWest},${pathingEast},${pathingBack}]`) && sameJson(observed.pathing.walks.slice(1), pathingExpected),
    walkOntoBossReroutesAsTheFloodStarts: sameJson([observed.pathingReroute.orders, observed.pathingReroute.orderTicks, observed.pathingReroute.walks], pathingRerouteExpected),
    walkOutFromUnderBossInTheFlood: sameJson([observed.pathingOut.orders, observed.pathingOut.orderTicks.slice(1), observed.pathingOut.walks], pathingOutExpected),
    controlClickOntoBossReroutesAtWalkPace: sameJson([observed.pathingControl.orders, observed.pathingControl.paces, observed.pathingControl.orderTicks, observed.pathingControl.walks], pathingControlExpected),
  };
  return { observed, checks };
}
