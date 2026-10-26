import { act } from "react";
import { TileMarker } from "osrs-sdk";
import { captureNavigation, loadPage } from "./page";

const RESULT_POLL_WAIT_MS = 400;

const probe = () => {
  if (!window.__archiveOcellusProbe) throw new Error("the page exposed no probe");
  return window.__archiveOcellusProbe;
};

async function loadP2Page(url: string) {
  const { P2Region } = await vi.importActual<typeof import("../js/P2Region")>("../js/P2Region");
  const built = vi.spyOn(P2Region.prototype, "initialiseRegion");
  const page = loadPage(url);
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  const region = built.mock.contexts.at(-1);
  built.mockRestore();
  if (!(region instanceof P2Region)) throw new Error("the page built no P2 region");
  await act(() => Promise.resolve());
  const tickTo = (t: number) => {
    for (let guard = 0; guard < 400; guard++) {
      const run = region.snapshot()?.run;
      if (run?.kind === "ended" || (run?.kind === "running" && run.tick >= t)) return;
      region.world.tickWorld();
    }
    throw new Error(`the run never reached P2 tick ${t}`);
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
  const markers = () => region.entities.filter((entity) => entity instanceof TileMarker).length;
  return { page, region, tickTo, result, markers };
}

const clickIfShown = (id: string) => act(() => document.getElementById(id)?.click());

describe("P2 behind the ARCHIVE_P2 build flag", () => {
  beforeEach(() => localStorage.removeItem("osrs-sdk:settings"));
  afterEach(() => vi.unstubAllEnvs());

  test("guard: with the flag off, ?phase=p2 opens P4 at its entry HP, lists phase=p2 as rejected and draws no Phase box", () => {
    const page = loadPage("/?phase=p2&seed=1");
    const { fight, rejected } = probe().snapshot();
    const phaseBox = document.querySelector("#phase");
    page.close();
    expect({ bossHp: fight?.boss.hp, rejected, phaseBox }).toEqual({ bossHp: 1312, rejected: ["phase=p2"], phaseBox: null });
  });

  test.each([
    {
      p3: "off",
      shown: { lines: ["Phase 2 cleared (interim end)", "P2 time: 131 ticks (1:18.6)", "Invincible was on.", "Ocellus goes into phase 3 at 5250 / 5250."], buttons: ["Repeat P2", "Retry seed"] },
      navigation: ["http://localhost/?phase=p2&invincible=on&markers=skip-tiles&setup=ranged", "http://localhost/?phase=p2&seed=1&invincible=on&markers=skip-tiles&setup=ranged"],
    },
    {
      p3: "on",
      shown: { lines: ["Phase 2 cleared (interim end)", "P2 time: 131 ticks (1:18.6)", "Invincible was on.", "Ocellus goes into phase 3 at 5250 / 5250."], buttons: ["Repeat P2", "Retry seed", "Start P3"] },
      navigation: ["http://localhost/?phase=p2&invincible=on&markers=skip-tiles&setup=ranged", "http://localhost/?phase=p2&seed=1&invincible=on&markers=skip-tiles&setup=ranged", "http://localhost/?phase=p3&setup=ranged&invincible=on"],
    },
  ])("with the flag on and ARCHIVE_P3 $p3, the end of phase 2 at P2 tick 131 shows the interim panel, and Repeat P2 and Retry seed keep the skip tiles", async ({ p3, shown, navigation }) => {
    vi.stubEnv("ARCHIVE_P2", "on");
    vi.stubEnv("ARCHIVE_P3", p3);
    const captured = captureNavigation();
    const fight = await loadP2Page("/?phase=p2&seed=1&invincible=on&markers=skip-tiles");
    fight.tickTo(130);
    const whileRunning = await fight.result();
    fight.tickTo(131);
    const ended = await fight.result();
    ["result_restart", "result_retry", "result_start_p3"].forEach(clickIfShown);
    fight.page.close();
    captured.restore();

    expect({ whileRunning, ended, navigation: captured.assigned }).toEqual({ whileRunning: null, ended: shown, navigation });
  });

  test("with the flag on, the Phase box lists Phase 2, Settings' Skip tiles box switches the markers during the run, and Restart keeps the choice with a fresh seed", async () => {
    vi.stubEnv("ARCHIVE_P2", "on");
    const captured = captureNavigation();
    const fight = await loadP2Page("/?phase=p2&seed=1");
    const phaseBox = fight.page.element("phase");
    const phases = phaseBox instanceof HTMLSelectElement ? { value: phaseBox.value, options: [...phaseBox.options].map((option) => option.text) } : null;
    const before = { checked: fight.page.checked("skip_tiles"), markers: fight.markers() };
    fight.page.click("skip_tiles");
    const after = { checked: fight.page.checked("skip_tiles"), markers: fight.markers() };
    fight.page.click("restart");
    fight.page.close();
    captured.restore();

    expect({ phases, before, after, navigation: captured.assigned }).toEqual({
      phases: { value: "p2", options: ["Phase 4", "Phase 2"] },
      before: { checked: false, markers: 0 },
      after: { checked: true, markers: 8 },
      navigation: ["http://localhost/?phase=p2&setup=ranged&markers=skip-tiles"],
    });
  });
});
