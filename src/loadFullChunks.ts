// Compiled as es2020 so these stay import() calls. The app compiles as CommonJS, and that turns import() into require(), which puts the fight in the entry chunk.
import { loadAttempts } from "./loadAttempts";

const FULL_FIGHT_LOAD_ATTEMPTS = 3;

export function loadFullFightPage() {
  return loadAttempts(FULL_FIGHT_LOAD_ATTEMPTS, () => import(/* webpackChunkName: "full-fight" */ "./content/ocellus/full/page"));
}

// webpackMode eager keeps this module in the entry chunk. `/` requests no sidebar script.
export function loadSidebar() {
  return import(/* webpackChunkName: "sidebar", webpackMode: "eager" */ "./menu/Sidebar");
}
