import { act } from "react";
import { clickTile } from "./drill";
import { captureNavigation, loadPage } from "./page";
import { footprintCentre } from "./p3drill";

const RESULT_POLL_WAIT_MS = 400;

const probe = () => {
  if (!window.__archiveOcellusProbe) throw new Error("the page exposed no probe");
  return window.__archiveOcellusProbe;
};

async function loadP1Page(url: string) {
  const { P1Region } = await vi.importActual<typeof import("../js/P1Region")>("../js/P1Region");
  const built = vi.spyOn(P1Region.prototype, "initialiseRegion");
  const page = loadPage(url);
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  const region = built.mock.contexts.at(-1);
  built.mockRestore();
  if (!(region instanceof P1Region)) throw new Error("the page built no P1 region");
  return { page, region };
}

const clickIfShown = (id: string) => act(() => document.getElementById(id)?.click());

async function openP1Fight(url: string) {
  const { page, region } = await loadP1Page(url);
  await act(() => Promise.resolve());
  const tickTo = (t: number) => {
    for (let guard = 0; guard < 400; guard++) {
      const run = region.snapshot()?.run;
      if (run?.kind === "ended" || (run?.kind === "running" && run.tick >= t)) return;
      region.world.tickWorld();
    }
    throw new Error(`the run never reached P1 tick ${t}`);
  };
  const result = async () => {
    await act(() => new Promise((resolve) => setTimeout(resolve, RESULT_POLL_WAIT_MS)));
    const panel = document.querySelector("#run_result");
    if (!panel) return null;
    return {
      lines: [...panel.querySelectorAll("h2, p")].map((line) => line.textContent),
      buttons: [...panel.querySelectorAll("button")].map((button) => button.textContent),
    };
  };
  const clickBoss = () => {
    if (!region.primaryBoss) throw new Error("the region has no boss");
    return clickTile(region.world, footprintCentre(region.primaryBoss));
  };
  return { page, region, tickTo, clickBoss, result };
}

describe("P1 behind the ARCHIVE_P1 build flag", () => {
  beforeEach(() => localStorage.removeItem("osrs-sdk:settings"));
  afterEach(() => vi.unstubAllEnvs());

  test("guard: with the flag off, ?phase=p1 opens P4 at its entry HP, lists phase=p1 as rejected and draws no Phase box", () => {
    const page = loadPage("/?phase=p1&seed=1");
    const { fight, rejected } = probe().snapshot();
    const phaseBox = document.querySelector("#phase");
    page.close();
    expect({ bossHp: fight?.boss.hp, rejected, phaseBox }).toEqual({ bossHp: 1312, rejected: ["phase=p1"], phaseBox: null });
  });

  test("with the flag on, phase 1's end shows the interim panel with the P1 time, and Repeat P1 and Retry seed carry the setup", async () => {
    vi.stubEnv("ARCHIVE_P1", "on");
    const navigation = captureNavigation();
    const fight = await openP1Fight("/?phase=p1&seed=100&bosshp=1");
    fight.tickTo(8);
    await fight.clickBoss();
    fight.tickTo(21);
    const whileTransforming = await fight.result();
    fight.tickTo(22);
    const shown = await fight.result();
    ["result_restart", "result_retry", "result_start_p4"].forEach(clickIfShown);
    fight.page.close();
    navigation.restore();

    expect({ whileTransforming, shown, navigation: navigation.assigned }).toEqual({
      whileTransforming: null,
      shown: { lines: ["Phase 1 cleared (interim end)", "P1 time: 22 ticks (0:13.2)"], buttons: ["Repeat P1", "Retry seed"] },
      navigation: ["http://localhost/?phase=p1&bosshp=1&setup=ranged", "http://localhost/?phase=p1&seed=100&bosshp=1&setup=ranged"],
    });
  });

  test("with the P1 and P2 flags on, phase 1's end also offers Start P2, which opens phase 2 with the same setup", async () => {
    vi.stubEnv("ARCHIVE_P1", "on");
    vi.stubEnv("ARCHIVE_P2", "on");
    const navigation = captureNavigation();
    const fight = await openP1Fight("/?phase=p1&seed=100&bosshp=1");
    fight.tickTo(8);
    await fight.clickBoss();
    fight.tickTo(22);
    const shown = await fight.result();
    clickIfShown("result_start_p2");
    fight.page.close();
    navigation.restore();

    expect({ buttons: shown?.buttons, navigation: navigation.assigned }).toEqual({
      buttons: ["Repeat P1", "Retry seed", "Start P2"],
      navigation: ["http://localhost/?phase=p2&setup=ranged"],
    });
  });

  test("with only the P1 flag on, the Phase box lists Phase 4 and Phase 1 and reloads Phase 1 with its defaults", () => {
    vi.stubEnv("ARCHIVE_P1", "on");
    const navigation = captureNavigation();
    const page = loadPage("/?phase=p4&setup=ranged&invincible=on");
    const phaseBox = page.element("phase");
    const shown = phaseBox instanceof HTMLSelectElement ? { value: phaseBox.value, options: [...phaseBox.options].map((option) => option.text) } : null;
    act(() => {
      if (phaseBox instanceof HTMLSelectElement) phaseBox.value = "p1";
      phaseBox.dispatchEvent(new Event("change", { bubbles: true }));
    });
    page.close();
    navigation.restore();

    expect({ shown, navigation: navigation.assigned }).toEqual({
      shown: { value: "p4", options: ["Phase 4", "Phase 1"] },
      navigation: ["http://localhost/?phase=p1&setup=ranged&invincible=on"],
    });
  });
});
