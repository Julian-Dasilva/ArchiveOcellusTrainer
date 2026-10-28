import { loadPage } from "./page";

const SEEN_RELEASE_KEY = "archive-ocellus:seen-release";
const FIRST_RELEASE = {
  version: "2026.10.23",
  date: "2026-10-23",
  notes: [
    "Hold Control and click a tile to walk there instead of running, like in game.",
    "Healing orbs never form on void puddles. The outer orb forms opposite where you entered the 5x5, and the inner orb lingers into the attack you pray against.",
    "In the melee phase you path around Ocellus instead of running under him.",
    "The east edge by the brazier gets its extra tile: 3 straight tiles, then the diagonal.",
    "Void puddles start stacked in the same corner tiles you'd use in game.",
  ],
};

const NEXT_RELEASE = {
  version: "2026.10.27",
  date: "2026-10-27",
  notes: [
    "The full fight is in beta. Full fight (beta) on the drill page opens it, and the phase selector starts you in phase 1, 2, or 3.",
    "The credit line sits under the game, so it no longer covers the tabs on a phone.",
    "Chat stays above the inventory on a narrow screen, so the lines no longer cover it.",
  ],
};

function whatsNew(page: ReturnType<typeof loadPage>) {
  const panel = page.element("whats_new_panel");
  return {
    settingsDot: page.element("settings").querySelector(".unseen_dot") !== null,
    menuDot: page.element("whats_new").querySelector(".unseen_dot") !== null,
    panelShown: panel.hidden === false,
    releases: [...panel.querySelectorAll("article")].map((article) => ({
      version: article.querySelector("h3")?.textContent,
      date: article.querySelector("time")?.getAttribute("datetime"),
      notes: [...article.querySelectorAll("li")].map((note) => note.textContent),
    })),
  };
}

describe("What's new", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("a first visit shows the dot until What's new is opened from Settings, the panel lists the releases newest first, and a reload keeps the dot cleared", () => {
    const page = loadPage("/?seed=1");
    const firstVisit = whatsNew(page);
    page.click("settings");
    page.click("whats_new");
    const opened = { ...whatsNew(page), menuShown: page.element("settings_menu").hidden === false, expanded: page.element("settings").getAttribute("aria-expanded") };
    page.click("whats_new_close");
    const closed = whatsNew(page).panelShown;
    const version = page.element("app_version").textContent;
    page.close();
    const reloaded = loadPage("/?seed=1");
    const afterReload = whatsNew(reloaded);
    reloaded.close();
    const versions = opened.releases.map((release) => release.version ?? "");

    expect({ firstVisit, opened, closed, afterReload, version, newestFirst: versions.join() === [...versions].sort().reverse().join() }).toEqual({
      firstVisit: { settingsDot: true, menuDot: true, panelShown: false, releases: expect.any(Array) },
      opened: {
        settingsDot: false,
        menuDot: false,
        panelShown: true,
        menuShown: false,
        expanded: "true",
        releases: expect.arrayContaining([FIRST_RELEASE]),
      },
      closed: false,
      afterReload: { settingsDot: false, menuDot: false, panelShown: false, releases: expect.any(Array) },
      version: `v${versions[0]}`,
      newestFirst: true,
    });
    expect(opened.releases.at(-1)).toEqual(FIRST_RELEASE);
  });

  test("a player who saw the last shipped release sees the dot again, and What's new opens on the unshipped releases, newest first, with the next shipped one below them", () => {
    localStorage.setItem(SEEN_RELEASE_KEY, "2026.10.27");
    const page = loadPage("/?seed=1");
    const { settingsDot, menuDot } = whatsNew(page);
    page.click("settings");
    page.click("whats_new");
    const { releases } = whatsNew(page);
    page.close();
    expect({ settingsDot, menuDot, unshipped: releases.slice(0, 1).map((release) => release.version), next: releases[1] }).toEqual({
      settingsDot: true, menuDot: true, unshipped: ["2026.10.28"], next: NEXT_RELEASE,
    });
  });

  test("opening What's new from the keyboard moves focus to the panel's title", () => {
    const page = loadPage("/?seed=1");
    page.click("settings");
    page.element("whats_new").focus();
    page.click("whats_new");
    const focused = document.activeElement?.id;
    page.close();
    expect(focused).toBe("whats_new_title");
  });

  test.each([
    ["Close", (page: ReturnType<typeof loadPage>) => page.click("whats_new_close")],
    ["Escape", (page: ReturnType<typeof loadPage>) => page.press("Escape", page.element("whats_new_close"))],
  ])("closing What's new with %s returns focus to Settings", (_, close) => {
    const page = loadPage("/?seed=1");
    page.click("settings");
    page.click("whats_new");
    page.element("whats_new_close").focus();
    close(page);
    const closed = { focused: document.activeElement?.id, panelShown: page.element("whats_new_panel").hidden === false };
    page.close();
    expect(closed).toEqual({ focused: "settings", panelShown: false });
  });

  test("storage that throws for the seen release still opens the panel and clears the dot for the visit", () => {
    // Blocked storage is a browser boundary; the SDK's own settings keys stay readable so the page can load.
    const { getItem, setItem } = Storage.prototype;
    const blocked = (key: string) => {
      if (key === SEEN_RELEASE_KEY) throw new DOMException("storage is blocked", "SecurityError");
    };
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      blocked(key);
      return getItem.call(this, key);
    });
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      blocked(key);
      setItem.call(this, key, value);
    });
    const page = loadPage("/?seed=1");
    const onLoad = whatsNew(page);
    page.click("settings");
    page.click("whats_new");
    const opened = whatsNew(page);
    page.close();
    read.mockRestore();
    write.mockRestore();

    expect({ onLoad: [onLoad.settingsDot, onLoad.menuDot], opened: [opened.settingsDot, opened.panelShown, opened.releases.at(-1)] }).toEqual({
      onLoad: [true, true],
      opened: [false, true, FIRST_RELEASE],
    });
  });
});
