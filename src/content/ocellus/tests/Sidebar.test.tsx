import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ControlPanelController } from "osrs-sdk";
import { FullFightApp } from "../../../FullFightApp";
import { captureNavigation, loadPage } from "./page";

const SAVED_SETTINGS = "osrs-sdk:settings";
const TILE_INDICATORS = ["destination_tile", "true_tile", "hovered_tile", "entity_outlines"] as const;

async function loadSidebarPage(url: string) {
  const page = loadPage(url);
  const lazyLoadMs = process.env.ARCHIVE_FULL === "on" ? 2000 : 50;
  for (const started = Date.now(); !document.querySelector("#sidebar") && Date.now() - started < lazyLoadMs; ) await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  return page;
}

function savedTileIndicators() {
  const values = JSON.parse(localStorage.getItem(SAVED_SETTINGS) ?? "{}").values ?? {};
  return [values.targetTileEnabled, values.trueTileEnabled, values.hoveredTileEnabled, values.entityIndicatorEnabled];
}

function loadFullFight() {
  window.history.replaceState(null, "", "/?mode=full");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<FullFightApp />));
  return {
    close: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function sidebarLayout() {
  const panel = document.querySelector("#right_panel");
  if (!panel) throw new Error("the page has no #right_panel");
  const scrolls = (element: Element) => {
    const style = getComputedStyle(element);
    return [style.overflowX, style.overflowY].some((overflow) => overflow === "auto" || overflow === "scroll");
  };
  const game = document.querySelector("#world")?.parentElement ?? null;
  const trainer = game?.parentElement ?? null;
  const policy = document.querySelector("#credit_line");
  return {
    scrollContainers: [panel, ...panel.querySelectorAll("*")].filter(scrolls).map((element) => element.id),
    panelOverflowX: getComputedStyle(panel).overflowX,
    sections: [...panel.querySelectorAll(".sidebar_title")].map((title) => title.textContent),
    policy: {
      text: policy?.textContent ?? null,
      overGame: game === null || game.contains(policy),
      trainerLayout: trainer ? getComputedStyle(trainer).display : null,
      trainerRows: trainer ? getComputedStyle(trainer).gridTemplateRows : null,
      stripRow: policy?.parentElement ? getComputedStyle(policy.parentElement).gridColumn : null,
      stripIsLastTrainerItem: trainer?.lastElementChild?.contains(policy) ?? false,
    },
  };
}

const POLICY_BELOW_GAME = {
  text: "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.",
  overGame: false,
  trainerLayout: "grid",
  trainerRows: "minmax(0, 1fr) auto",
  stripRow: "1 / -1",
  stripIsLastTrainerItem: true,
};

const openTab = () => Object.entries(ControlPanelController.controls).find(([, control]) => control === ControlPanelController.controller.selectedControl)?.[0] ?? null;

describe("the sidebar behind ARCHIVE_FULL", () => {
  beforeEach(() => localStorage.removeItem(SAVED_SETTINGS));
  afterEach(() => vi.unstubAllEnvs());

  test.each([
    { full: "off", expected: { sidebar: false, fullFight: false, settingsButton: true, footerMaker: true, comingSoon: "Phases 1 to 3 coming soon." } },
    { full: "on", expected: { sidebar: true, fullFight: true, settingsButton: false, footerMaker: false, comingSoon: null } },
  ])("with ARCHIVE_FULL $full, the drill's controls sit in the sidebar with the Full fight (beta) entry only when the flag is on", async ({ full, expected }) => {
    vi.stubEnv("ARCHIVE_FULL", full);
    const page = await loadSidebarPage("/?seed=1");
    const sidebar = document.querySelector("#sidebar");
    const shown = {
      sidebar: sidebar?.contains(page.element("setup")) ?? false,
      fullFight: document.querySelector("#full_fight")?.textContent === "Full fight (beta)",
      settingsButton: document.querySelector("#settings") !== null,
      footerMaker: document.querySelector("#credits #maker_credit") !== null,
      comingSoon: document.getElementById("coming_soon")?.textContent ?? null,
    };
    page.close();
    expect(shown).toEqual(expected);
  });

  test("each tile indicator box flips its SDK setting at once and saves it", async () => {
    vi.stubEnv("ARCHIVE_FULL", "on");
    const page = await loadSidebarPage("/?seed=1");
    const boxes = () => TILE_INDICATORS.map((id) => page.checked(id));
    const onLoad = boxes();
    for (const id of TILE_INDICATORS) page.click(id);
    const afterClick = { boxes: boxes(), saved: savedTileIndicators() };
    for (const id of TILE_INDICATORS) page.click(id);
    const afterSecondClick = { boxes: boxes(), saved: savedTileIndicators() };
    page.close();

    expect({ onLoad, afterClick, afterSecondClick }).toEqual({
      onLoad: [true, false, true, true],
      afterClick: { boxes: [false, true, false, false], saved: [false, true, false, false] },
      afterSecondClick: { boxes: [true, false, true, true], saved: [true, false, true, true] },
    });
  });

  test("Full fight (beta) opens the full fight, and Keybinds in the sidebar opens the key bindings", async () => {
    vi.stubEnv("ARCHIVE_FULL", "on");
    const navigation = captureNavigation();
    const page = await loadSidebarPage("/?seed=1&setup=ranged");
    page.click("full_fight");
    page.click("keybinds");
    const tab = openTab();
    page.close();
    navigation.restore();

    expect({ navigation: navigation.assigned, tab }).toEqual({ navigation: ["http://localhost/?mode=full"], tab: "SETTINGS" });
  });

  test("the sidebar credits the makers first, then Alessandro Rodi on X, and the footer keeps the Jagex credit line", async () => {
    vi.stubEnv("ARCHIVE_FULL", "on");
    const page = await loadSidebarPage("/?seed=1");
    const credits = page.element("sidebar_credits");
    const shown = {
      lines: [...credits.querySelectorAll("li")].map((line) => line.textContent),
      links: [...credits.querySelectorAll("a")].map((link) => [link.textContent, link.href, link.target, link.rel]),
      jagex: page.element("credit_line").textContent,
    };
    page.close();

    expect(shown).toEqual({
      lines: ["Made by Julian Dasilva / Moarhots: GitHub · @ShadowJdas", "With help from Alessandro Rodi"],
      links: [
        ["GitHub", "https://github.com/Julian-Dasilva/ArchiveOcellusTrainer", "_blank", "noopener noreferrer"],
        ["@ShadowJdas", "https://x.com/ShadowJdas", "_blank", "noopener noreferrer"],
        ["Alessandro Rodi", "https://x.com/alrodi", "_blank", "noopener noreferrer"],
      ],
      jagex: "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.",
    });
  });

  test("on the drill and the full fight, the side panel is the only scroll container, never scrolls sideways, and lists the same sections, and the policy line sits below the game canvas", async () => {
    vi.stubEnv("ARCHIVE_FULL", "on");
    const drillPage = await loadSidebarPage("/?seed=1");
    const drill = sidebarLayout();
    drillPage.close();
    const fullPage = loadFullFight();
    const full = sidebarLayout();
    fullPage.close();

    expect({ drill, full }).toEqual({
      drill: { scrollContainers: ["right_panel"], panelOverflowX: "hidden", sections: ["Fight", "Learning aids", "Sound", "Controls", "About"], policy: POLICY_BELOW_GAME },
      full: { scrollContainers: ["right_panel"], panelOverflowX: "hidden", sections: ["Fight", "Learning aids", "Sound", "Controls", "About", "Phase 1"], policy: POLICY_BELOW_GAME },
    });
  });
});
