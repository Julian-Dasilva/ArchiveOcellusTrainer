import { act } from "react";
import { OcellusRegion } from "../js/OcellusRegion";
import { captureNavigation, loadPage } from "./page";

function choose(id: string, value: string, page: ReturnType<typeof loadPage>) {
  act(() => {
    const select = page.element(id);
    if (!(select instanceof HTMLSelectElement)) throw new Error(`#${id} is not a select`);
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("Settings menu", () => {
  beforeEach(() => localStorage.removeItem("osrs-sdk:settings"));

  test("the Settings button opens the menu, a click inside keeps it open, and a second click, Escape, Escape in the seed box or a click outside closes it", () => {
    const page = loadPage("/?seed=1");
    const shown = () => [page.element("settings_menu").hidden === false, page.element("settings").getAttribute("aria-expanded")];
    const states: Record<string, unknown> = { onLoad: shown() };
    page.click("settings");
    states.afterClick = shown();
    act(() => void page.element("sound").dispatchEvent(new Event("pointerdown", { bubbles: true })));
    states.afterClickInside = shown();
    page.click("settings");
    states.afterSecondClick = shown();
    page.click("settings");
    page.press("Escape");
    states.afterEscape = shown();
    page.click("settings");
    page.press("Escape", page.element("seed"));
    states.afterEscapeInSeedBox = shown();
    page.click("settings");
    act(() => void document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    states.afterClickOutside = shown();
    states.restartOutsideMenu = page.element("settings_menu").contains(page.element("restart"));
    page.close();

    expect(states).toEqual({
      onLoad: [false, "false"],
      afterClick: [true, "true"],
      afterClickInside: [true, "true"],
      afterSecondClick: [false, "false"],
      afterEscape: [false, "false"],
      afterEscapeInSeedBox: [false, "false"],
      afterClickOutside: [false, "false"],
      restartOutsideMenu: false,
    });
  });

  test("guard, controls unchanged: a setup chosen in the open menu is the one Restart loads", () => {
    const navigation = captureNavigation();
    const page = loadPage("/?seed=3");
    page.click("settings");
    choose("setup", "melee", page);
    page.click("restart");
    page.close();
    navigation.restore();
    expect(navigation.assigned).toEqual(["http://localhost/?setup=melee&focus=full-fight"]);
  });

  test("picking Rifts as the Focus loads the rifts drill, whose first boss step is P4 tick 62, five ticks before the rifts spawn", () => {
    const navigation = captureNavigation();
    const menuPage = loadPage("/?seed=1");
    menuPage.click("settings");
    choose("focus", "rifts", menuPage);
    menuPage.close();
    navigation.restore();

    // The page builds its own region; the call-through spy hands the test that instance so it can tick the world the SDK loop would.
    const built = vi.spyOn(OcellusRegion.prototype, "initialiseRegion");
    const drillPage = loadPage(navigation.assigned[0] ?? "/");
    const region = built.mock.contexts.at(-1);
    built.mockRestore();
    if (!(region instanceof OcellusRegion)) throw new Error("the page built no region");
    region.world.tickWorld(region.world.getReadyTimer);
    const firstStep = region.snapshot()?.run;
    drillPage.close();

    expect([navigation.assigned, firstStep]).toEqual([
      ["http://localhost/?setup=ranged&focus=rifts"],
      { kind: "running", tick: 62, phase: { stage: "after-outer", cycle: 1, boss: "present-damageable", overhead: "soul-split" } },
    ]);
  });
});
