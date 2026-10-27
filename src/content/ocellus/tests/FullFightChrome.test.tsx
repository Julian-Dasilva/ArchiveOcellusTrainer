import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ControlPanelController, Trainer } from "osrs-sdk";
import { CHANGELOG } from "../changelog";
import { FightRegion } from "../full/prefix";
import { FullFightApp } from "../../../FullFightApp";

const POLICY = "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.";
const [LATEST_RELEASE] = CHANGELOG;

function loadFullFight(url: string) {
  window.history.replaceState(null, "", url);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<FullFightApp />));
  const element = (id: string): HTMLElement => {
    const found = container.querySelector<HTMLElement>(`#${id}`);
    if (!found) throw new Error(`the page has no #${id}`);
    return found;
  };
  return {
    element,
    checked: (id: string) => {
      const box = element(id);
      if (!(box instanceof HTMLInputElement)) throw new Error(`#${id} is not a checkbox`);
      return box.checked;
    },
    click: (id: string) => act(() => element(id).click()),
    close: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function captureAssign() {
  const real = window.location;
  const assigned: string[] = [];
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get href() { return real.href; },
      get pathname() { return real.pathname; },
      assign: (url: string) => void assigned.push(url),
    },
  });
  return { assigned, restore: () => Object.defineProperty(window, "location", { configurable: true, value: real }) };
}

const openTab = () => Object.entries(ControlPanelController.controls).find(([, control]) => control === ControlPanelController.controller.selectedControl)?.[0] ?? null;

function phaseValue(element: HTMLElement): string | null {
  return element instanceof HTMLSelectElement ? element.value : null;
}

describe("the full fight page", () => {
  beforeEach(() => localStorage.removeItem("osrs-sdk:settings"));

  test("shows the drill chat and credits, our sidebar, and the fight controls", () => {
    const page = loadFullFight("/?mode=full&phase=1&seed=1");
    const corner = page.element("hud_corner");
    const credits = page.element("sidebar_credits");
    const shown = {
      corner: [...corner.children].map((child) => child.id),
      chat: corner.querySelector(".fight-chat"),
      hisMenu: document.querySelector(".fight-sidebar"),
      footer: [...page.element("policy_footer").children].map((child) => child.id),
      policy: page.element("credit_line").textContent,
      version: page.element("app_version").textContent,
      footerMaker: document.querySelector("#credits #maker_credit"),
      home: page.element("phase_4_drill").textContent,
      fullFightButton: document.querySelector("#full_fight"),
      follow: document.body.textContent?.includes("Follow @alrodi on X") ?? false,
      lines: [...credits.querySelectorAll("li")].map((line) => line.textContent),
      links: [...credits.querySelectorAll("a")].map((link) => [link.textContent, link.href]),
      phase: phaseValue(page.element("start_phase")),
      aids: page.element("learning_aids").querySelector(".sidebar_title")?.textContent ?? null,
      danger: page.checked("hazard_tiles"),
      dangerInAids: page.element("learning_aids").contains(page.element("hazard_tiles")),
      markers: page.checked("video_markers"),
      practice: page.checked("practice"),
      tipsTitle: page.element("phase_tips").querySelector(".sidebar_title")?.textContent ?? null,
      firstTip: page.element("phase_tips").querySelector("li")?.textContent ?? null,
      keybinds: page.element("keybinds").textContent,
    };
    page.close();

    expect(shown).toEqual({
      corner: ["game_chat"],
      chat: null,
      hisMenu: null,
      footer: ["sidebar_credits", "credit_line", "app_version"],
      policy: POLICY,
      version: `v${LATEST_RELEASE.version}`,
      footerMaker: null,
      home: "Phase 4 drill",
      fullFightButton: null,
      follow: false,
      lines: ["Made by Julian Dasilva / Moarhots: GitHub · @ShadowJdas", "With help from Alessandro Rodi"],
      links: [
        ["GitHub", "https://github.com/Julian-Dasilva/ArchiveOcellusTrainer"],
        ["@ShadowJdas", "https://x.com/ShadowJdas"],
        ["Alessandro Rodi", "https://x.com/alrodi"],
      ],
      phase: "1",
      aids: "Learning aids",
      danger: true,
      dangerInAids: true,
      markers: false,
      practice: false,
      tipsTitle: "Phase 1",
      firstTip: "Pray Missiles for the orange fire volleys, Magic for the blue water ones. Prayer is checked when the shot lands.",
      keybinds: "Keybinds",
    });
  });

  test("practice stays on without a reload, Keybinds opens the bindings, Start fight reloads the chosen phase, and Phase 4 drill leaves the full fight", () => {
    const page = loadFullFight("/?mode=full&phase=1&seed=1&setup=ranged");
    page.click("practice");
    const practiced = { checked: page.checked("practice"), search: window.location.search };
    page.click("keybinds");
    const tab = openTab();
    const startPhase = page.element("start_phase");
    if (!(startPhase instanceof HTMLSelectElement)) throw new Error("start phase is not a select");
    act(() => {
      startPhase.value = "3";
      startPhase.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const navigation = captureAssign();
    page.click("start_fight");
    page.click("phase_4_drill");
    const assigned = navigation.assigned;
    navigation.restore();
    page.close();

    expect({ practiced, tab, assigned }).toEqual({
      practiced: { checked: true, search: "?mode=full&phase=1&seed=1&setup=ranged&practice=1" },
      tab: "SETTINGS",
      assigned: [
        "http://localhost/?mode=full&phase=3&setup=ranged&practice=1&tiles=1&markers=0&skip=0&vine=1",
        "/",
      ],
    });
  });

  test("danger tiles start on, the toggle hides them, and a reload keeps the choice", () => {
    const page = loadFullFight("/?mode=full&phase=1&seed=1");
    const region = fightRegion();
    const fight = region.fight;
    if (!fight) throw new Error("the region built no fight");
    region.world.getReadyTimer = 0;
    let ticks = 0;
    for (; ticks < 80 && fight.marks().length === 0; ticks++) region.world.tickWorld();
    const shown = fight.marks().length;
    page.click("hazard_tiles");
    const hidden = { marks: fight.marks().length, checked: page.checked("hazard_tiles"), search: window.location.search };
    page.click("hazard_tiles");
    const restored = { marks: fight.marks().length, checked: page.checked("hazard_tiles"), search: window.location.search };
    page.close();

    const saved = loadFullFight("/?mode=full&phase=1&seed=1&tiles=0");
    const savedRegion = fightRegion();
    const savedFight = savedRegion.fight;
    if (!savedFight) throw new Error("the region built no fight");
    savedRegion.world.getReadyTimer = 0;
    for (let i = 0; i < ticks; i++) savedRegion.world.tickWorld();
    const off = { marks: savedFight.marks().length, checked: saved.checked("hazard_tiles") };
    saved.close();

    expect(shown).toBeGreaterThan(0);
    expect({ hidden, restored, off }).toEqual({
      hidden: { marks: 0, checked: false, search: "?mode=full&phase=1&seed=1&tiles=0" },
      restored: { marks: shown, checked: true, search: "?mode=full&phase=1&seed=1&tiles=1" },
      off: { marks: 0, checked: false },
    });
  });

  test("the death dialog and the clear screen link both accounts, ours first", () => {
    const read = () => {
      const line = document.querySelector(".fight-result-follow");
      if (!(line instanceof HTMLParagraphElement)) throw new Error("the page has no update line");
      return {
        heading: document.querySelector(".fight-result h2")?.textContent ?? null,
        text: line.textContent,
        links: [...line.querySelectorAll("a")].map((link) => [link.textContent, link.href]),
      };
    };

    const dead = loadFullFight("/?mode=full&phase=1&seed=1");
    const lost = fightRegion().fight;
    if (!lost) throw new Error("the region built no fight");
    act(() => lost.lose("a hit"));
    const death = read();
    dead.close();

    const clear = loadFullFight("/?mode=full&phase=1&seed=1");
    const won = fightRegion().fight;
    if (!won) throw new Error("the region built no fight");
    act(() => won.win());
    const victory = read();
    clear.close();

    const line = {
      text: "Updates and new sims: @ShadowJdas and @alrodi on X",
      links: [
        ["@ShadowJdas", "https://x.com/ShadowJdas"],
        ["@alrodi", "https://x.com/alrodi"],
      ],
    };
    expect({ death, victory }).toEqual({
      death: { heading: "Oh dear, you are dead!", ...line },
      victory: { heading: "Ocellus defeated", ...line },
    });
  });
});

function fightRegion(): FightRegion {
  const region = Trainer.player.region;
  if (!(region instanceof FightRegion)) throw new Error("the trainer is not the full fight");
  return region;
}
