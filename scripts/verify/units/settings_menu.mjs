export const captures = () => [
  "menu-closed-desktop.png", "menu-open-desktop.png", "menu-closed-small.png", "menu-open-small.png", "menu-closed-mobile.png", "menu-open-mobile.png", "menu.json",
  "menu-page-errors.json", "menu-small-page-errors.json", "menu-mobile-page-errors.json",
];

export function judge({ read, env }) {
  const controls = JSON.parse(env.MENU_CONTROLS);
  const menu = read("menu.json");
  const errors = ["menu-page-errors.json", "menu-small-page-errors.json", "menu-mobile-page-errors.json"].map(read);
  const views = [menu.desktop, menu.small, menu.mobile];
  const closed = (s) => s.expanded === "false" && s.menu === false && controls.every((id) => s.controls[id] === false) && s.buttons.settings && s.buttons.restart && s.credit;
  const noPageScroll = (s) => s.viewport.scrollWidth <= s.viewport.width;
  const inViewport = (s) => s.menuBox.left >= 0 && s.menuBox.top >= 0 && s.menuBox.right <= s.viewport.width && s.menuBox.bottom <= s.viewport.height;
  const clearOfFooter = (s) => s.controlsBox.bottom <= s.footerBox.top;
  const checks = {
    menuHiddenUntilOpened: views.every((view) => closed(view.closed) && noPageScroll(view.closed)),
    buttonsClearOfFooter: views.every((view) => clearOfFooter(view.closed)),
    menuOpensWithEveryControl: views.every((view) => view.open.expanded === "true" && view.open.menu && controls.every((id) => view.open.controls[id] === true) && view.open.buttons.restart && view.open.credit),
    menuFitsEveryViewport: views.every((view) => inViewport(view.open) && noPageScroll(view.open)) && menu.small.open.viewport.width === 800 && menu.mobile.open.viewport.width < 500,
    menuClosesOnSecondClick: views.every((view) => closed(view.secondClick)),
    menuClosesOnEscape: closed(menu.escape),
    menuStaysOpenOnInsideClick: menu.inside.expanded === "true" && menu.inside.menu === true,
    menuClosesOnOutsideClick: closed(menu.outside),
    noMenuPageErrors: errors.every((list) => list.length === 0),
  };
  return { observed: {}, checks };
}
