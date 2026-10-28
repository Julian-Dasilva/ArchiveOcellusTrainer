import { hoverTextOf, pixels, sameJson } from "../lib.mjs";

export const captures = () => [
  "supplies-inventory.json", "item-menu.json", "item-menu.png", "item-menu-closed.json", "brew-click.json", "brew-hp.json", "brew-heal.png", "supplies-console.log", "supplies-page-errors.json", "canvas-centre.json",
];

export function judge({ read, bytes, env }) {
  const { SUPPLY_INVENTORY: supplyInventory, SUPPLY_NAMED_MENU: namedMenu, SUPPLY_HP_AFTER_BREW: hpAfterBrew } = env;
  const hoverText = hoverTextOf(pixels(bytes).decode, env, read("canvas-centre.json"));
  const [carried, itemMenu, itemMenuClosed, brewClick, brewHp] = ["supplies-inventory.json", "item-menu.json", "item-menu-closed.json", "brew-click.json", "brew-hp.json"].map(read);
  const observed = {
    supplies: {
      carried,
      itemMenu: [itemMenu, itemMenuClosed],
      brew: { clickedAt: brewClick, hp: brewHp.filter(([tick]) => tick >= brewClick - 1 && tick <= brewClick + 3) },
    },
    hoverText: { "brew-heal.png": hoverText("brew-heal.png") },
  };
  const checks = {
    itemNamedInMenu: sameJson(itemMenu, namedMenu) && itemMenuClosed === null,
    suppliesCarried: sameJson(carried, supplyInventory),
    brewHealedNextTick: (() => {
      const healed = brewHp.find(([, hp]) => hp !== 99);
      return healed !== undefined && healed[1] === Number(hpAfterBrew) && healed[0] > brewClick && healed[0] <= brewClick + 2;
    })(),
  };
  return { observed, checks };
}
