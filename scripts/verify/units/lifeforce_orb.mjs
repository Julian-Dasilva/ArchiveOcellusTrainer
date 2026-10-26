import { kindOf, pixels, same, sameJson } from "../lib.mjs";

const frames = (look, count) => Array.from({ length: Number(count) }, (_, i) => `orb-${look}-${i + 1}.png`);

export const captures = ({ ORB_FRAMES }) => [
  "orb-hit.png", ...frames("dormant", ORB_FRAMES), ...frames("glow", ORB_FRAMES), "orb-click.json", "orb.json", "orb-console.log", "orb-page-errors.json",
  "orb-skip.png", "orb-skip.json", "orb-skip-console.log", "orb-skip-page-errors.json",
];

export function judge({ read, bytes, env }) {
  const { ORB_EXPECTED: orbExpected, ORB_BOX: orbBox, ORB_FRAMES: orbFrames } = env;
  const { pixelShare } = pixels(bytes);
  const [orbLog, orbClick, orbSkip] = ["orb.json", "orb-click.json", "orb-skip.json"].map(read);
  const offset = JSON.parse(orbBox);
  const around = { minX: orbClick.x + offset.minX, maxX: orbClick.x + offset.maxX, minY: orbClick.y + offset.minY, maxY: orbClick.y + offset.maxY };
  const orbTeal = (look) => Array.from({ length: Number(orbFrames) }, (_, i) => pixelShare(`orb-${look}-${i + 1}.png`, (r, g, b) => g >= 120 && g - r >= 60 && b - r >= 30, around));
  const expectedOrb = JSON.parse(orbExpected);
  const orbTile = expectedOrb.spawned[0][1];
  const observed = {
    orb: {
      told: kindOf(orbLog.rows, "lifeforce-told").map((e) => [e.at, e.void]),
      drained: kindOf(orbLog.rows, "lifeforce-drained").map((e) => [e.at, e.receipt.applied, e.receipt.afterHp]),
      spawned: kindOf(orbLog.rows, "orb-spawned").map((e) => [e.at, e.tile, e.credit]),
      clicked: orbClick.snapshot?.destination ?? null,
      arrivedAt: orbLog.rows.find((row) => same(row.playerAtPostTick.tile, orbTile))?.tick ?? null,
      matured: kindOf(orbLog.rows, "orb-matured").map((e) => [e.at, e.tile]),
      returned: kindOf(orbLog.rows, "orb-returned").map((e) => [e.at, e.receipt]),
      skipExpired: kindOf(orbSkip.rows, "orb-expired").map((e) => [e.at, e.void]),
      skipHeal: kindOf(orbSkip.rows, "boss-healed").map((e) => [e.at, e.cause, e.receipt]),
      skipReturned: kindOf(orbSkip.rows, "orb-returned").length,
      tealShare: { box: around, dormant: orbTeal("dormant"), glow: orbTeal("glow") },
    },
  };
  const orb = observed.orb;
  const readyAt = Math.max(orb.arrivedAt ?? Infinity, orb.matured[0]?.[0] ?? Infinity);
  const checks = {
    orbToldAndDrained: sameJson(orb.told, JSON.stringify(expectedOrb.told)) && sameJson(orb.drained, JSON.stringify(expectedOrb.drained)),
    orbSpawnedDormant: sameJson(orb.spawned, JSON.stringify(expectedOrb.spawned)),
    orbClickTargetedOrb: same(orb.clicked, orbTile),
    orbGlowsOnSchedule: sameJson(orb.matured, JSON.stringify(expectedOrb.matured)),
    orbReturnedTickAfterArrival: orb.returned.length === 1 && orb.returned[0][0] === readyAt + 1 && sameJson(orb.returned[0][1], JSON.stringify(expectedOrb.returned)),
    orbGlowDrawn: Math.max(...orb.tealShare.glow) - Math.max(...orb.tealShare.dormant) >= 3,
    skippedOrbHealsBoss: sameJson(orb.skipExpired, JSON.stringify(expectedOrb.skipExpired)) && sameJson(orb.skipHeal, JSON.stringify(expectedOrb.skipHeal)) && orb.skipReturned === 0,
  };
  return { observed, checks };
}
