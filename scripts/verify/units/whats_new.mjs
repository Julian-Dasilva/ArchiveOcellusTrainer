export const captures = () => [
  "whats-new-notes.md", "whats-new-unseen.png", "whats-new-open.png", "whats-new-small.png", "whats-new-phone.png", "whats-new-seen.png", "whats-new.json",
  "whats-new-page-errors.json", "whats-new-reload-page-errors.json",
];

export function judge({ read, text, env }) {
  const notes = text("whats-new-notes.md"), credit = env.CREDIT_LINE;
  const w = read("whats-new.json");
  const [heading, , ...items] = notes.trimEnd().split("\n");
  const newest = { version: heading.replace(/^## /, ""), notes: items.map((item) => item.replace(/^- /, "")) };
  const inViewport = (s) => s.panelBox.left >= 0 && s.panelBox.top >= 0 && s.panelBox.right <= s.viewport.width && s.panelBox.bottom <= s.viewport.height;
  const noPageScroll = (s) => s.viewport.scrollWidth <= s.viewport.width;
  const beside = (s) => s.versionBox.left >= s.creditBox.right && s.versionBox.top < s.creditBox.bottom && s.versionBox.bottom > s.creditBox.top;
  const checks = {
    dotShownBeforeOpening: w.first.seen === null && w.first.settingsDot && !w.first.menu && !w.first.panel && w.menu.menu && w.menu.whatsNewButton && w.menu.menuDot,
    whatsNewListsNewestRelease: w.opened.panel && !w.opened.menu && w.opened.releases[0]?.version === newest.version && JSON.stringify(w.opened.releases[0].notes) === JSON.stringify(newest.notes),
    dotClearsOnOpen: !w.opened.settingsDot && w.opened.seen === newest.version,
    panelFitsEveryViewport: [w.opened, w.small, w.phone].every((s) => s.panel && inViewport(s) && noPageScroll(s)) && w.small.viewport.width === 800 && w.phone.viewport.width < 500,
    panelClosesOnCloseAndEscape: !w.closed.panel && !w.closed.menu && !w.escape.panel && !w.escape.menu,
    keyboardOpenFocusesPanelTitle: w.keyMenu.menu && w.keyMenu.focused === "whats_new" && w.keyOpened.panel && w.keyOpened.focused === "whats_new_title" && w.keyOpened.focusedVisible,
    keyboardCloseAndEscapeFocusSettings: [w.keyClosed, w.keyEscaped].every((s) => !s.panel && !s.menu && s.focused === "settings" && s.focusedVisible),
    dotStaysClearedAfterReload: w.reloaded.seen === newest.version && !w.reloaded.settingsDot && w.reopened.whatsNewButton && !w.reopened.menuDot,
    versionBesideCredit: w.first.credit === credit && w.first.version === `v${newest.version}` && beside(w.first) && w.phone.version === `v${newest.version}`,
    noWhatsNewPageErrors: ["whats-new-page-errors.json", "whats-new-reload-page-errors.json"].map(read).every((list) => list.length === 0),
  };
  return { observed: {}, checks };
}
