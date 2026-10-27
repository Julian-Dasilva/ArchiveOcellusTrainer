// Compiled as es2020 so these stay import() calls. The app compiles as CommonJS, and that turns import() into require(), which puts the fight in the entry chunk.

export function loadFullFightPage() {
  return import(/* webpackChunkName: "full-fight" */ "./content/ocellus/full/page");
}

export function loadSidebar() {
  return import(/* webpackChunkName: "sidebar" */ "./menu/Sidebar");
}
