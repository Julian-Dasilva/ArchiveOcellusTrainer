import { same, sameJson } from "../lib.mjs";

export const captures = () => ["orb-off-holes.png", "orb-off-holes.json", "orb-off-holes-console.log", "orb-off-holes-page-errors.json"];

export function judge({ read, env }) {
  const { ORB_HOLES_EXPECTED: orbHolesExpected, ORB_HOLES_LAYOUT: orbHolesLayout } = env;
  const orbHolesLog = read("orb-off-holes.json");
  const observed = {
    orbOffHoles: {
      layout: { key: orbHolesLog.header.choices.floorHoleLayout.key, tiles: orbHolesLog.header.choices.floorHoleLayout.option.value.tiles },
      spawned: orbHolesLog.rows.flatMap((row) => row.events.filter((e) => e.kind === "orb-spawned").map((e) => [e.at, e.void, e.tile])),
    },
  };
  const checks = {
    orbFormsOffTheHoles: sameJson(observed.orbOffHoles.layout, orbHolesLayout) && sameJson(observed.orbOffHoles.spawned, orbHolesExpected) &&
      observed.orbOffHoles.spawned.every(([, , tile]) => !JSON.parse(orbHolesLayout).tiles.some((hole) => same(tile, hole))),
  };
  return { observed, checks };
}
