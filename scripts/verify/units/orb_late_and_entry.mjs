import { kindOf, sameJson } from "../lib.mjs";

export const captures = () => ["orb-late.png", "orb-late.json", "orb-late-page-errors.json", "orb-entry.png", "orb-entry.json", "orb-entry-console.log", "orb-entry-page-errors.json"];

export function judge({ read, env }) {
  const { ORB_EXPECTED: orbExpected, ORB_INNER_CLEAR_TICK: orbInnerClear, ORB_INNER_EXPIRY_TICK: orbInnerExpiry, ORB_ENTRY_TILE: orbEntryTile,
    ORB_OPPOSITE_EXPECTED: orbOppositeExpected } = env;
  const [orbLateLog, orbEntryLog] = ["orb-late.json", "orb-entry.json"].map(read);
  const expectedOrb = JSON.parse(orbExpected);
  const observed = {
    orbLate: {
      returned: kindOf(orbLateLog.rows, "orb-returned").map((e) => [e.at, e.void, e.receipt]),
      innerExpired: kindOf(orbLateLog.rows, "orb-expired").filter((e) => e.void === "inner-void").map((e) => e.at),
    },
    orbEntry: {
      walks: orbEntryLog.rows.flatMap((row) => row.inputs.filter((i) => i.kind === "walk-ordered").map((i) => i.destination)),
      outer: kindOf(orbEntryLog.rows, "orb-spawned").filter((e) => e.void === "outer-void").map((e) => [e.at, e.tile]),
    },
  };
  const checks = {
    orbPickedUpAfterTheClear: observed.orbLate.returned.length === 1 && observed.orbLate.returned[0][0] > Number(orbInnerClear) &&
      observed.orbLate.returned[0][0] <= Number(orbInnerExpiry) && observed.orbLate.returned[0][1] === "inner-void" &&
      sameJson(observed.orbLate.returned[0][2], JSON.stringify(expectedOrb.returned)) && observed.orbLate.innerExpired.length === 0,
    outerOrbOppositeEntry: sameJson(observed.orbEntry.walks, `[${orbEntryTile}]`) && sameJson(observed.orbEntry.outer, orbOppositeExpected),
  };
  return { observed, checks };
}
