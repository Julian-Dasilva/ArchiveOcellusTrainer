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
  version: "2026.10.26",
  date: "2026-10-26",
  notes: [
    "The 2D view is gone, and the 3D view draws each frame in about 14 draw calls instead of about 550. Gear switches after your first hitch far less. A typical switch's slowest frame drops from about 50 ms to one frame at 60 Hz.",
    "The void shards of each explosion now come in high over your head, from the game's own effect, so you can see the cue to step while you move.",
    "Change your mind before the tick, like in game. Whatever you click last before the tick is what you do, even a click made right before it.",
    "Ocellus takes damage as soon as he is back on the platform, and standing on your lifeforce orb as it glows gives your HP back that tick.",
    "A void rift left alive bursts 30 ticks after it appears and hits you once for 28 to 41, and destroying a rift resets your attack timer.",
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
    localStorage.setItem(SEEN_RELEASE_KEY, "2026.10.25.1");
    const page = loadPage("/?seed=1");
    const { settingsDot, menuDot } = whatsNew(page);
    page.click("settings");
    page.click("whats_new");
    const { releases } = whatsNew(page);
    page.close();
    expect({ settingsDot, menuDot, unshipped: releases.slice(0, 2).map((release) => release.version), next: releases[2] }).toEqual({
      settingsDot: true, menuDot: true, unshipped: ["2026.10.26.2", "2026.10.26.1"], next: NEXT_RELEASE,
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
