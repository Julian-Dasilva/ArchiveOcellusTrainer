import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ControlPanelController, Trainer, TrainerInstance, Viewport } from "osrs-sdk";
import type { TrainerLoadingState } from "osrs-sdk";
import { CHANGELOG } from "../changelog";
import { QUADRANTS, quadrantOf, quadrantTiles } from "../fight/geometry";
import { FightPlayer } from "../fight/units";
import { p4CameraFacing } from "../full/fall";
import { FightRegion } from "../full/prefix";
import { OCELLUS_P4 } from "../js/OcellusTimings";
import { FullFightPage } from "../full/page";

const POLICY = "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.";
const [LATEST_RELEASE] = CHANGELOG;

function loadFullFight(url: string) {
  window.history.replaceState(null, "", url);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<FullFightPage />));
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
    press: (key: string) => act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))),
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

  test("shows the chat and credits, our sidebar, and the fight controls, with no drill or full fight toggle", () => {
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
      toggles: ["phase_4_drill", "full_fight"].filter((id) => document.getElementById(id) !== null),
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
      toggles: [],
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

  test("practice stays on without a reload, Keybinds opens the bindings, and Start fight reloads the chosen phase", () => {
    const page = loadFullFight("/?mode=full&phase=1&seed=1&weapon=blowpipe");
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
    const assigned = navigation.assigned;
    navigation.restore();
    page.close();

    expect({ practiced, tab, assigned }).toEqual({
      practiced: { checked: true, search: "?mode=full&phase=1&seed=1&weapon=blowpipe&practice=1" },
      tab: "SETTINGS",
      assigned: [
        "http://localhost/?mode=full&phase=3&weapon=blowpipe&practice=1&tier=raid&drained=0&tiles=1&markers=0&skip=0&vine=1",
      ],
    });
  });

  test.each(["/", "/?seed=1&invincible=on", "/?seed=4&bosshp=1&focus=void-floor&drillStart=cycle-start", "/?phase=p3&seed=1"])("%s opens the full fight with Start at on phase 4 and phase 4 mounted", (link) => {
    const page = loadFullFight(link);
    const select = page.element("start_phase");
    const shown = {
      startAt: select instanceof HTMLSelectElement ? select.value : null,
      tips: page.element("phase_tips").querySelector(".sidebar_title")?.textContent ?? null,
      phase: fightRegion().current,
    };
    page.close();
    expect(shown).toEqual({ startAt: "4", tips: "Phase 4", phase: "p4" });
  });

  test("Restart reloads the same seed with the toggles as they stand, so no click queued before it plays in the new run", () => {
    const page = loadFullFight("/?seed=7&weapon=melee");
    page.click("practice");
    const navigation = captureAssign();
    page.click("restart_fight");
    const assigned = navigation.assigned;
    navigation.restore();
    page.close();

    expect(assigned).toEqual(["http://localhost/?seed=7&weapon=melee&practice=1&phase=4&tier=raid&drained=0&tiles=1&markers=0&skip=0&vine=1"]);
  });

  test("Start with is the twisted bow unless the link names another, and only the weapon in hand changes", () => {
    const dressed = (link: string) => {
      const page = loadFullFight(link);
      const you = fightRegion().players[0];
      const id = (item: { cacheItemId?: unknown } | null | undefined) => (typeof item?.cacheItemId === "number" ? item.cacheItemId : null);
      const shown = {
        chosen: document.getElementById("start_weapon") instanceof HTMLSelectElement ? phaseValue(page.element("start_weapon")) : null,
        weapon: id(you?.equipment.weapon),
        helmet: id(you?.equipment.helmet),
        bag: you?.inventory.map(id) ?? [],
      };
      page.close();
      return shown;
    };
    const supplies = [12695, 22461, 6685, 3024, 12695, 22461, 6685, 3024, 6685, 6685, 6685, 3024, 6685, 6685, 6685, 3024, 6685];
    expect({ unnamed: dressed("/?seed=1"), blowpipe: dressed("/?seed=1&weapon=blowpipe"), melee: dressed("/?seed=1&weapon=melee"), unknown: dressed("/?seed=1&weapon=bow") }).toEqual({
      unnamed: { chosen: "twistedBow", weapon: 20997, helmet: 27235, bag: [28922, 22325, 24419, 24420, 24421, 22981, 21295, 29801, 25485, ...supplies, 12926, 3024] },
      blowpipe: { chosen: "blowpipe", weapon: 12926, helmet: 27235, bag: [28922, 22325, 24419, 24420, 24421, 22981, 21295, 29801, 25485, ...supplies, 20997, 3024] },
      melee: { chosen: "melee", weapon: 22325, helmet: 24419, bag: [28922, 20997, 27235, 27238, 27241, 26235, 28951, 33639, 28310, ...supplies, 12926, 3024] },
      unknown: { chosen: "twistedBow", weapon: 20997, helmet: 27235, bag: [28922, 22325, 24419, 24420, 24421, 22981, 21295, 29801, 25485, ...supplies, 12926, 3024] },
    });
  });

  test("a tier link dresses that tier, Start with offers only its weapons, the panel names what it leaves out, and Restart keeps the tier chosen in the panel", () => {
    const choose = (id: string, value: string) =>
      act(() => {
        const select = document.getElementById(id);
        if (select instanceof HTMLSelectElement) {
          select.value = value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    const shown = () => {
      const you = fightRegion().players[0];
      const id = (item: { cacheItemId?: unknown } | null | undefined) => (typeof item?.cacheItemId === "number" ? item.cacheItemId : null);
      const weapons = document.getElementById("start_weapon");
      return {
        tier: phaseValue(document.getElementById("start_tier") ?? document.body),
        starts: weapons instanceof HTMLSelectElement ? [...weapons.options].map((option) => `${option.value} ${option.text}`) : [],
        chosen: weapons instanceof HTMLSelectElement ? weapons.value : null,
        leftOut: document.getElementById("tier_not_simulated")?.textContent ?? null,
        worn: [id(you?.equipment.weapon), id(you?.equipment.helmet), id(you?.equipment.gloves), id(you?.equipment.cape)],
      };
    };
    const low = loadFullFight("/?seed=1&tier=low&weapon=twistedBow");
    const lowShown = shown();
    low.close();
    const page = loadFullFight("/?seed=7&weapon=blowpipe");
    const raidShown = shown();
    choose("start_tier", "max");
    const maxPanel = shown();
    choose("start_weapon", "ralos");
    const navigation = captureAssign();
    page.click("restart_fight");
    const assigned = navigation.assigned;
    navigation.restore();
    page.close();

    expect({ lowShown, raidShown, maxStarts: maxPanel.starts, maxChosen: maxPanel.chosen, maxLeftOut: maxPanel.leftOut, assigned }).toEqual({
      lowShown: {
        tier: "low",
        starts: ["blowpipe Toxic blowpipe"],
        chosen: "blowpipe",
        leftOut:
          "Not simulated yet, so left out: Emberlight, Ghommal's avernic defender 6, Magma helm, Eclipse Moon chestplate, Eclipse Moon tassets, Amulet of blood fury, Dragon boots, Berserker ring (i), Dragon crossbow, Blessed Dizana's quiver, Divine rune pouch, Necklace of anguish (or), Twisted buckler, Book of the Dead, Scorching bow, Dragon warhammer, Ranging potion ×2, Sanfew serum",
        worn: [12926, null, 7462, 21295],
      },
      raidShown: { tier: "raid", starts: ["twistedBow Twisted bow (Masori)", "blowpipe Toxic blowpipe (Masori)", "melee Scythe (Inquisitor's)"], chosen: "blowpipe", leftOut: null, worn: [12926, 27235, 26235, 28951] },
      maxStarts: ["twistedBow Twisted bow (Masori)", "blowpipe Toxic blowpipe (Masori)", "ralos Tonalztics of Ralos (Inquisitor's)"],
      maxChosen: "blowpipe",
      maxLeftOut: "Not simulated yet, so left out: Book of the Dead, Ferocious gloves, Zaryte crossbow, Blessed Dizana's quiver, Lightbearer, Ranging potion ×2, Sanguine scythe of Vitur, Divine super combat potion, Sanfew serum, Divine rune pouch",
      assigned: ["http://localhost/?seed=7&weapon=ralos&phase=4&tier=max&drained=0&tiles=1&markers=0&skip=0&vine=1&practice=0"],
    });
  });

  test("Defence drained starts phase 4 at his floor, and Restart keeps it with the start weapon chosen in the panel", () => {
    const opening = (link: string) => {
      const page = loadFullFight(link);
      const box = document.getElementById("defence_drained");
      const shown = { drained: box instanceof HTMLInputElement ? box.checked : null, defence: fightRegion().p4.mounted?.ocellus.currentStats.defence ?? null };
      page.close();
      return shown;
    };
    const full = opening("/?seed=7");
    const drained = opening("/?seed=7&drained=1");
    const page = loadFullFight("/?seed=7");
    act(() => {
      const weapon = document.getElementById("start_weapon");
      if (weapon instanceof HTMLSelectElement) {
        weapon.value = "melee";
        weapon.dispatchEvent(new Event("change", { bubbles: true }));
      }
      document.getElementById("defence_drained")?.click();
    });
    const navigation = captureAssign();
    page.click("restart_fight");
    const assigned = navigation.assigned;
    navigation.restore();
    page.close();

    expect({ full, drained, assigned }).toEqual({
      full: { drained: false, defence: 250 },
      drained: { drained: true, defence: 150 },
      assigned: ["http://localhost/?seed=7&phase=4&tier=raid&weapon=melee&drained=1&tiles=1&markers=0&skip=0&vine=1&practice=0"],
    });
  });

  test("offers phase 4 on Start at, and choosing it reloads the full fight at phase 4", () => {
    const loaded = loadFullFight("/?mode=full&phase=4&weapon=blowpipe");
    const loadedSelect = loaded.element("start_phase");
    if (!(loadedSelect instanceof HTMLSelectElement)) throw new Error("start phase is not a select");
    const fromUrl = {
      offered: [...loadedSelect.options].map((option) => option.value),
      value: loadedSelect.value,
      title: loaded.element("phase_tips").querySelector(".sidebar_title")?.textContent ?? null,
    };
    loaded.close();

    const page = loadFullFight("/?mode=full&phase=1&weapon=blowpipe");
    const startPhase = page.element("start_phase");
    if (!(startPhase instanceof HTMLSelectElement)) throw new Error("start phase is not a select");
    act(() => {
      startPhase.value = "4";
      startPhase.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const navigation = captureAssign();
    page.click("start_fight");
    const assigned = navigation.assigned;
    navigation.restore();
    page.close();

    expect({ fromUrl, assigned }).toEqual({
      fromUrl: { offered: ["1", "2", "3", "4"], value: "4", title: "Phase 4" },
      assigned: ["http://localhost/?mode=full&phase=4&weapon=blowpipe&tier=raid&drained=0&tiles=1&markers=0&skip=0&vine=1&practice=0"],
    });
  });

  test("danger tiles start on, the toggle hides them, and a reload keeps the choice", () => {
    const page = loadFullFight("/?mode=full&phase=1&seed=1");
    const region = fightRegion();
    const marks = () => {
      const views = region.p1.mounted?.views;
      if (!views) throw new Error("phase 1 is not running");
      return views.marks().length;
    };
    region.world.getReadyTimer = 0;
    let ticks = 0;
    for (; ticks < 80 && marks() === 0; ticks++) region.world.tickWorld();
    const shown = marks();
    page.click("hazard_tiles");
    const hidden = { marks: marks(), checked: page.checked("hazard_tiles"), search: window.location.search };
    page.click("hazard_tiles");
    const restored = { marks: marks(), checked: page.checked("hazard_tiles"), search: window.location.search };
    page.close();

    const saved = loadFullFight("/?mode=full&phase=1&seed=1&tiles=0");
    const savedRegion = fightRegion();
    const savedViews = savedRegion.p1.mounted?.views;
    if (!savedViews) throw new Error("phase 1 is not running");
    savedRegion.world.getReadyTimer = 0;
    for (let i = 0; i < ticks; i++) savedRegion.world.tickWorld();
    const off = { marks: savedViews.marks().length, checked: saved.checked("hazard_tiles") };
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
    const lost = fightRegion().p1.mounted?.script;
    if (!lost) throw new Error("phase 1 is not running");
    act(() => lost.lose());
    const death = read();
    dead.close();

    const clear = loadFullFight("/?mode=full&phase=1&seed=1");
    const won = fightRegion().p1.mounted?.script;
    if (!won) throw new Error("phase 1 is not running");
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

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FRAME_MS = 50;
const TICK_MS = 600;
const READY: TrainerLoadingState = { assetProgress: 1, assetsLoaded: 0, assetsReady: true, assetsTotal: 0, imagesReady: true, status: "ready", viewportReady: true };

let clock = 0;

function play(region: FightRegion, ms: number) {
  act(() => {
    for (let left = ms; left > 0; left -= FRAME_MS) region.world.browserLoop((clock += FRAME_MS));
  });
}

function gate() {
  const region = fightRegion();
  return {
    start: document.getElementById("start")?.textContent ?? null,
    pause: document.getElementById("pause")?.textContent ?? null,
    resume: document.getElementById("resume")?.textContent ?? null,
    world: region.world.globalTickCounter,
    held: region.world.isPaused,
    hud: document.querySelector(".fight-hud-tick")?.textContent ?? null,
    phase: region.current,
  };
}

/** Drops each pool to its floor and leaves a crumbling quadrant, so phase 3 reaches P4 without a death. */
function reachP4(region: FightRegion): void {
  const you = () => {
    const first = region.players[0];
    if (!(first instanceof FightPlayer)) throw new Error("the region has no full-fight player");
    return first;
  };
  const leave = () => {
    const crumbling = region.floorState().crumbling;
    const here = quadrantOf(you().arenaTile());
    if (crumbling[0] === undefined || here !== crumbling[0]) return;
    const next = QUADRANTS.find((quadrant) => quadrant !== here && !region.floorState().destroyed.includes(quadrant));
    if (!next) throw new Error("no quadrant left to stand on");
    const floor = quadrantTiles(next).find((tile) => region.p3.mounted?.arena.isWalkable(tile));
    if (!floor) throw new Error(`no floor in ${next}`);
    you().hop(floor);
  };
  act(() => {
    for (let step = 0; step < 2500 && region.floorState().destroyed.length < 3; step++) {
      region.world.tickWorld();
      const boss = region.p1.mounted?.boss;
      if (region.current === "p1" && boss && boss.form === "p1" && boss.currentStats.hitpoint > 0) boss.currentStats.hitpoint = 0;
      const p3 = region.p3.mounted;
      if (region.current === "p3" && p3) {
        p3.boss.currentStats.hitpoint = Math.min(p3.boss.currentStats.hitpoint, p3.script.hpFloor(p3.boss.stats.hitpoint));
        leave();
      }
    }
    for (let step = 0; step < 30 && region.current !== "p4"; step++) region.world.tickWorld();
  });
  if (region.current !== "p4") throw new Error(`the third fall left the fight in ${region.current}`);
}

describe("full fight pause", () => {
  beforeEach(() => {
    localStorage.clear();
    clock = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(0);
    vi.spyOn(TrainerInstance.prototype, "load").mockImplementation(async (options) => options?.onStateChange?.(READY));
    vi.spyOn(Viewport.prototype, "draw").mockReturnValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  test("phases 1, 2 and 3 wait on Start, and pause holds the tick until resume", async () => {
    const held: Record<number, ReturnType<typeof gate>> = {};
    for (const phase of [1, 2, 3] as const) {
      const page = loadFullFight(`/?mode=full&phase=${phase}&seed=1&practice=1`);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      held[phase] = gate();
      page.close();
    }

    expect(held).toEqual({
      1: { start: "Start", pause: null, resume: null, world: 0, held: true, hud: "tick 0", phase: "p1" },
      2: { start: "Start", pause: null, resume: null, world: 0, held: true, hud: "tick 0", phase: "p2" },
      3: { start: "Start", pause: null, resume: null, world: 0, held: true, hud: "tick 0", phase: "p3" },
    });

    const page = loadFullFight("/?mode=full&phase=1&seed=1&practice=1");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    play(fightRegion(), 10_000);
    const waiting = gate();
    page.click("start");
    play(fightRegion(), 8 * TICK_MS + FRAME_MS);
    const running = gate();
    page.click("pause");
    play(fightRegion(), 10_000);
    const paused = gate();
    page.click("resume");
    play(fightRegion(), TICK_MS + FRAME_MS);
    const resumed = gate();
    page.press("p");
    play(fightRegion(), 10_000);
    const pausedByKey = gate();
    page.press("p");
    play(fightRegion(), TICK_MS + FRAME_MS);
    const resumedByKey = gate();
    page.close();

    const shown = (row: ReturnType<typeof gate>) => ({ start: row.start, pause: row.pause, resume: row.resume, world: row.world, held: row.held, phase: row.phase });
    expect({
      waiting: shown(waiting),
      running: shown(running),
      paused: shown(paused),
      resumed: shown(resumed),
      pausedByKey: shown(pausedByKey),
      resumedByKey: shown(resumedByKey),
      hudWhilePaused: paused.hud,
      hudWhileKeyPaused: pausedByKey.hud,
    }).toEqual({
      waiting: { start: "Start", pause: null, resume: null, world: 0, held: true, phase: "p1" },
      running: { start: null, pause: "Pause (P)", resume: null, world: 8, held: false, phase: "p1" },
      paused: { start: null, pause: null, resume: "Resume (P)", world: 8, held: true, phase: "p1" },
      resumed: { start: null, pause: "Pause (P)", resume: null, world: 9, held: false, phase: "p1" },
      pausedByKey: { start: null, pause: null, resume: "Resume (P)", world: 9, held: true, phase: "p1" },
      resumedByKey: { start: null, pause: "Pause (P)", resume: null, world: 10, held: false, phase: "p1" },
      hudWhilePaused: running.hud,
      hudWhileKeyPaused: resumed.hud,
    });
  });

  test("pause after the third fall holds phase 4 on that tick", async () => {
    const page = loadFullFight("/?mode=full&phase=3&seed=1&practice=1");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const waiting = gate();
    expect(waiting).toEqual({ start: "Start", pause: null, resume: null, world: 0, held: true, hud: "tick 0", phase: "p3" });
    page.click("start");
    reachP4(fightRegion());
    const atP4 = gate();
    page.click("pause");
    play(fightRegion(), 10_000);
    const paused = gate();
    page.click("resume");
    play(fightRegion(), TICK_MS + FRAME_MS);
    const resumed = gate();
    page.close();

    expect({
      arrived: { pause: atP4.pause, held: atP4.held, phase: atP4.phase },
      paused: { resume: paused.resume, held: paused.held, world: paused.world, hud: paused.hud, phase: paused.phase },
      resumed: { world: resumed.world, phase: resumed.phase, held: resumed.held },
    }).toEqual({
      arrived: { pause: "Pause (P)", held: false, phase: "p4" },
      paused: { resume: "Resume (P)", held: true, world: atP4.world, hud: atP4.hud, phase: "p4" },
      resumed: { world: atP4.world + 1, phase: "p4", held: false },
    });
  });

  test("phase 4 hides the fight clock, shows the drill chat, and turns the camera with the platform", async () => {
    const faced: string[] = [];
    const page = loadFullFight("/?mode=full&phase=3&seed=1&practice=1");
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const before = document.querySelector(".fight-hud") !== null;
      const region = fightRegion();
      page.click("start");
      const viewport = Viewport.viewport;
      vi.spyOn(viewport, "rotateSouth").mockImplementation(() => faced.push("south"));
      vi.spyOn(viewport, "rotateWest").mockImplementation(() => faced.push("west"));
      vi.spyOn(viewport, "rotateNorth").mockImplementation(() => faced.push("north"));
      vi.spyOn(viewport, "rotateEast").mockImplementation(() => faced.push("east"));
      reachP4(region);
      const lifeforce = OCELLUS_P4.lifeforce.tellChat.value;
      act(() => {
        for (let step = 0; step < 40 && !region.p4.mounted?.views.chat.includes(lifeforce); step++) region.world.tickWorld();
      });
      const lines = [...document.querySelectorAll("#game_chat li")];
      const shown = lines.map((line) => line.textContent);
      const drillLines = region.p4.mounted?.views.chat.slice(-5) ?? [];
      expect({
        clockBefore: before,
        clockDuring: document.querySelector(".fight-hud"),
        aimed: faced,
        historyKept: region.chat().some((line) => line.text.includes("Jump across the stones")),
        shown,
        lifeforceStyle: lines.find((line) => line.textContent === lifeforce)?.getAttribute("style") ?? null,
      }).toEqual({
        clockBefore: true,
        clockDuring: null,
        aimed: [p4CameraFacing(region.floorState().destroyed)],
        historyKept: true,
        shown: drillLines,
        lifeforceStyle: null,
      });
      expect(drillLines).toContain(lifeforce);
      expect(shown.some((text) => text?.includes("Jump across the stones"))).toBe(false);
    } finally {
      page.close();
    }
  });
});

function fightRegion(): FightRegion {
  const region = Trainer.player.region;
  if (!(region instanceof FightRegion)) throw new Error("the trainer is not the full fight");
  return region;
}
