import { OCELLUS_P4 } from "../OcellusTimings";
import type { Cycle, Seed, Tick, Tile } from "../../../../sim/brands";
import type { TileSet } from "../../../../sim/tiles";
import { reach } from "../../../../sim/tiles";
import { FOOTPRINT, PLATFORM } from "./floor";
import { roll } from "../roll";

const { firstCycle, countFromFirstCycle, distanceFromBoss } = OCELLUS_P4.rifts;
const fromBoss = (at: Tile) => Math.min(...FOOTPRINT.tiles().map((under) => reach(under, at)));
const RIFT_FLOOR = PLATFORM.tiles()
  .filter((at) => fromBoss(at) >= distanceFromBoss.value.min && fromBoss(at) <= distanceFromBoss.value.max)
  .sort((a, b) => a.y - b.y || a.x - b.x);

export function riftTiles(seed: Seed, forCycle: Cycle, at: Tick, holes: TileSet): readonly Tile[] {
  const counts = countFromFirstCycle.value;
  const count = counts[Math.min(forCycle - firstCycle.value, counts.length - 1)];
  const open = RIFT_FLOOR.filter((candidate) => !holes.contains(candidate));
  if (open.length < count) throw new RangeError(`${count} rifts need ${count} open floor tiles, and only ${open.length} are left`);
  return Array.from({ length: count }, (_, slot) => open.splice(Math.floor(roll(seed, "riftTile", at, slot) * open.length), 1)[0]);
}
