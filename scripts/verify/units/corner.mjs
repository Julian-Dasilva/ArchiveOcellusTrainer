import { sameJson, walkOrders } from "../lib.mjs";

export const captures = () => [
  "tile-clicks.jsonl", "corner-hole.json", "corner-hole-log.json", "corner-hole.png", "corner-nub.json", "corner-nub-log.json", "corner-console.log", "corner-page-errors.json",
  "corner-view.png", "corner-view-page-errors.json",
];

export function judge({ read, env }) {
  const { CORNER_HOLE_TILE: cornerHole, CORNER_NUB_TILE: cornerNub } = env;
  const [cornerAtHole, cornerHoleLog, cornerAtNub, cornerNubLog] = ["corner-hole.json", "corner-hole-log.json", "corner-nub.json", "corner-nub-log.json"].map(read);
  const observed = { corner: { orders: [...walkOrders(cornerHoleLog), ...walkOrders(cornerNubLog)], stood: [cornerAtHole.player, cornerAtNub.player] } };
  const checks = {
    cornerFilled: sameJson(observed.corner.orders, `[${cornerHole},${cornerNub}]`) && sameJson(observed.corner.stood, `[${cornerHole},${cornerNub}]`),
  };
  return { observed, checks };
}
