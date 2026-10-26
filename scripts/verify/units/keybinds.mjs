import { hoverTextOf, pixels } from "../lib.mjs";

export const captures = () => [
  "keybinds-open.json", "keybinds.png", "keybinds-bound.json", "keybinds-saved.json", "keybinds-old-key.json", "keybinds-reloaded.json", "keybinds-reloaded.png",
  "keybinds-restored.json", "keybinds-console.log", "keybinds-page-errors.json",
];

export function judge({ read, bytes, env }) {
  const { KEYBIND_DEFAULT_KEY: defaultKey, KEYBIND_NEW_KEY: newKey } = env;
  const hoverText = hoverTextOf(pixels(bytes).decode, env);
  const [keysOpen, keysBound, keysSaved, keysOldKey, keysReloaded, keysRestored] =
    ["keybinds-open.json", "keybinds-bound.json", "keybinds-saved.json", "keybinds-old-key.json", "keybinds-reloaded.json", "keybinds-restored.json"].map(read);
  const observed = {
    keybinds: {
      tabs: [keysOpen.tab, keysBound.tab, keysOldKey.tab, keysReloaded.tab],
      inventoryKey: [keysOpen.keys.inventory, keysBound.keys.inventory, keysSaved.values?.inventory_key ?? null, keysReloaded.keys.inventory, keysRestored.keys.inventory],
    },
    hoverText: { "keybinds.png": hoverText("keybinds.png") },
  };
  const checks = {
    keybindsButtonOpensSettings: keysOpen.tab === "SETTINGS" && keysOpen.keys.inventory === defaultKey,
    keyBoundAndSaved: keysBound.keys.inventory === newKey && keysSaved.values?.inventory_key === newKey,
    boundKeyOpensTabAfterReload: keysOldKey.tab === "PRAYER" && keysReloaded.tab === "INVENTORY" && keysReloaded.keys.inventory === newKey,
    defaultKeyRestored: keysRestored.keys.inventory === defaultKey,
  };
  return { observed, checks };
}
