import { CACHE_ASSETS } from "osrs-sdk/asset-manifest";
import { OCELLUS_P4 } from "../../src/content/ocellus/js/OcellusTimings";
import type { TierSlot } from "../../src/content/ocellus/js/OcellusTimings";

const { gear } = OCELLUS_P4;
const low = gear.tiers.low.value;
const simulatedId = (slot: TierSlot): number | null => slot?.value.simulation === "simulated" ? slot.value.id : null;
const worn = Object.fromEntries(Object.entries(low.equipment).map(([slot, item]) => [slot, simulatedId(item)]));
const leftOut = [...Object.values(low.equipment), ...low.inventory].flatMap((slot) => slot !== null && slot.value.simulation !== "simulated" ? [slot.value.name] : []);
const counts = new Map<string, number>();
for (const name of leftOut) counts.set(name, (counts.get(name) ?? 0) + 1);
const names = [...counts].map(([name, count]) => count === 1 ? name : `${name} ×${count}`).join(", ");

console.log(JSON.stringify({
  low: {
    worn: {
      ...worn,
      weapon: gear.blowpipe.value.itemId,
      offhand: null,
      ammo: worn.ammo === 33595 ? CACHE_ASSETS.items.seekingDragonArrows.id : worn.ammo,
    },
    starts: low.starts.map(({ weapon }) => weapon),
    leftOut: names.length === 0 ? null : `Not simulated yet, so left out: ${names}`,
  },
  maxInventory: gear.tiers.max.value.inventory.map(simulatedId),
}));
