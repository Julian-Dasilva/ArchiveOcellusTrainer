const PHASES = ["p4", "p3"];
const stores = (unreadable) => ["saved", ...unreadable.split(" "), "refused"];

export const captures = ({ SAVED_LOADOUT_UNREADABLE: unreadable }) => [
  ...PHASES.flatMap((phase) => stores(unreadable).map((store) => `saved-loadout-${phase}-${store}.json`)),
  "refused-storage.js",
];

export function judge({ read, env }) {
  const { SAVED_LOADOUT_UNREADABLE: unreadable, LOADOUT_MELEE_WORN: savedWorn, SAVED_LOADOUT_INVENTORY: savedInventory, LOADOUT_RANGED_WORN: defaultWorn, SUPPLY_INVENTORY: defaultInventory, SAVED_LOADOUT_NOTE: note } = env;
  const page = (phase, store) => read(`saved-loadout-${phase}-${store}.json`);
  const canonical = (value) => JSON.stringify(value, (_, part) => (part && typeof part === "object" && !Array.isArray(part) ? Object.fromEntries(Object.entries(part).sort()) : part));
  const starts = ({ page, errors }, worn, inventory, shownNote) =>
    page.start && page.note === shownNote && canonical(page.worn) === canonical(JSON.parse(worn)) && canonical(page.inventory) === canonical(JSON.parse(inventory)) && errors.length === 0;
  const checks = {};
  for (const phase of PHASES) {
    checks[`${phase}-saved-worn-and-carried`] = starts(page(phase, "saved"), savedWorn, savedInventory, null);
    for (const store of unreadable.split(" ")) checks[`${phase}-${store}-starts-the-default-with-a-note`] = starts(page(phase, store), defaultWorn, defaultInventory, note);
    checks[`${phase}-refused-storage-starts-the-default`] = starts(page(phase, "refused"), defaultWorn, defaultInventory, null);
  }
  return { observed: { saved: page("p4", "saved") }, checks };
}
