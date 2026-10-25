import { act } from "react";
import { ControlPanelController, SettingsControls, TrainerInstance, Viewport } from "osrs-sdk";
import type { TrainerLoadingState } from "osrs-sdk";
import { OcellusRegion } from "../js/OcellusRegion";
import { RING_NORTH, UNDER_BOSS, clickTile } from "./drill";
import type { At } from "./drill";
import { loadPage } from "./page";

const FRAME_MS = 50;
const SAVED_SETTINGS = "osrs-sdk:settings";
const READY: TrainerLoadingState = { assetProgress: 1, assetsLoaded: 0, assetsReady: true, assetsTotal: 0, imagesReady: true, status: "ready", viewportReady: true };

let now = 0;

const probe = () => {
  if (!window.__archiveOcellusProbe) throw new Error("the page exposed no probe");
  return window.__archiveOcellusProbe;
};

const openTab = () => Object.entries(ControlPanelController.controls).find(([, control]) => control === ControlPanelController.controller.selectedControl)?.[0] ?? null;
const bindingSettled = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)));
const shown = (id: string) => document.getElementById(id)?.textContent ?? null;

async function openRun(url: string) {
  const built = vi.spyOn(OcellusRegion.prototype, "initialiseRegion");
  const page = loadPage(url);
  const region = built.mock.contexts.at(-1);
  built.mockRestore();
  if (!(region instanceof OcellusRegion)) throw new Error("the page built no region");
  await act(() => Promise.resolve());
  const { world } = region;
  const p4Tick = () => {
    const run = probe().snapshot().fight?.run;
    return run?.kind === "running" ? run.tick : -1;
  };
  const play = (ms: number) =>
    act(() => {
      for (let left = ms; left > 0; left -= FRAME_MS) world.browserLoop((now += FRAME_MS));
    });
  const playTo = (t: number) => {
    for (let guard = 0; p4Tick() < t && probe().snapshot().fight?.run.kind !== "ended"; guard++) {
      if (guard > 4000) throw new Error(`the run never reached P4 tick ${t}`);
      play(FRAME_MS);
    }
  };
  const click = async (on: At) => clickTile(world, on);
  return { page, region, world, p4Tick, play, playTo, click };
}

describe("Set-up and pause", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(SAVED_SETTINGS, JSON.stringify({ version: 1, values: { use3dView: false, inventory_key: "F4", prayer_key: "F5" } }));
    now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    // jsdom has no frame loop; each test calls the SDK's browserLoop itself, once per 50 ms frame.
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(0);
    // Models never load offline, so the loading gate reports ready the way a loaded page does, and jsdom has no canvas to draw frames on.
    vi.spyOn(TrainerInstance.prototype, "load").mockImplementation(async (options) => options?.onStateChange?.(READY));
    vi.spyOn(Viewport.prototype, "draw").mockReturnValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  test("the page opens with Start and no tick for as long as it waits, and Start begins GET READY", async () => {
    const run = await openRun("/?seed=1");
    run.play(10_000);
    const setUp = { tick: run.world.globalTickCounter, ticking: probe().snapshot().ticking, start: shown("start"), pause: shown("pause") };
    run.page.click("start");
    run.play(3 * 600 + FRAME_MS);
    const started = { tick: run.world.globalTickCounter, getReady: run.world.getReadyTimer, start: shown("start"), pause: shown("pause") };
    run.page.close();

    expect({ setUp, started }).toEqual({
      setUp: { tick: 0, ticking: false, start: "Start", pause: null },
      started: { tick: 3, getReady: 3, start: null, pause: "Pause (P)" },
    });
  });

  async function playScript(pauseAt: number | null) {
    const run = await openRun("/?seed=1&invincible=on");
    run.page.click("start");
    run.playTo(4);
    await run.click(RING_NORTH);
    run.playTo(pauseAt ?? 9);
    let paused = null;
    if (pauseAt !== null) {
      run.page.click("pause");
      run.play(60_000);
      const heldAt = run.p4Tick();
      act(() => SettingsControls.instance?.startKeyBinding("inventory"));
      run.page.press("F6");
      await bindingSettled();
      run.page.click("resume");
      run.page.press("F6");
      paused = { heldAt, tabAfterResume: openTab() };
    }
    run.playTo(15);
    await run.click(UNDER_BOSS);
    run.playTo(30);
    const { rows } = run.region.fightLog();
    const { pauses } = probe().log();
    run.page.close();
    return { rows: JSON.stringify(rows), lastTick: rows.at(-1)?.tick, pauses, paused };
  }

  test("a pause holds the tick, takes a new key binding, and resumes into the same fight log as an unpaused run", async () => {
    const unpaused = await playScript(null);
    const pausedRun = await playScript(9);

    expect({ sameRows: pausedRun.rows === unpaused.rows, lastTicks: [unpaused.lastTick, pausedRun.lastTick], pauses: [unpaused.pauses, pausedRun.pauses], paused: [unpaused.paused, pausedRun.paused] }).toEqual({
      sameRows: true,
      lastTicks: [30, 30],
      pauses: [[], [{ at: 15, ms: 60_000 }]],
      paused: [null, { heldAt: 9, tabAfterResume: "INVENTORY" }],
    });
  });

  test("P pauses and resumes, but not before Start, not in the seed field, not while binding a key, and not once a tab is bound to it", async () => {
    const run = await openRun("/?seed=1");
    const state = () => (shown("start") !== null ? "set-up" : shown("resume") !== null ? "paused" : "running");
    const states: string[] = [];
    run.page.press("p");
    states.push(state());
    run.page.click("start");
    run.playTo(2);
    run.page.press("p");
    states.push(state());
    run.page.press("p");
    states.push(state());
    run.page.press("p", run.page.element("seed"));
    states.push(state());
    act(() => SettingsControls.instance?.startKeyBinding("prayer"));
    run.page.press("p");
    await bindingSettled();
    states.push(state());
    run.page.press("p");
    states.push(state(), openTab() ?? "none");
    run.playTo(12);
    const inputs = run.region.fightLog().rows.flatMap((row) => row.inputs);
    run.page.close();

    expect({ states, inputs }).toEqual({ states: ["set-up", "paused", "running", "running", "running", "running", "PRAYER"], inputs: [] });
  });

  test("hiding the tab mid-run pauses it through the SDK, and that pause is logged too", async () => {
    const run = await openRun("/?seed=1&invincible=on");
    const setVisibility = (state: DocumentVisibilityState) =>
      act(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    run.page.click("start");
    run.playTo(3);
    setVisibility("hidden");
    const heldAt = run.p4Tick();
    run.play(5000);
    const whileHidden = { tick: run.p4Tick(), resume: shown("resume") };
    setVisibility("visible");
    act(() => [...document.querySelectorAll("button")].find((button) => button.textContent === "Resume")?.click());
    run.playTo(heldAt + 2);
    const { pauses } = probe().log();
    run.page.close();

    expect({ heldAt, whileHidden, pauses }).toEqual({ heldAt: 3, whileHidden: { tick: 3, resume: "Resume (P)" }, pauses: [{ at: 9, ms: 5000 }] });
  });

  test("a run that was paused says so in its result", async () => {
    const run = await openRun("/?seed=1&focus=void-floor");
    run.page.click("start");
    run.playTo(20);
    run.page.click("pause");
    run.play(12_500);
    run.page.click("resume");
    run.playTo(60);
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    const lines = [...document.querySelectorAll("#run_result h2, #run_result p")].map((line) => line.textContent);
    run.page.close();

    expect(lines).toEqual(["You died", "on P4 tick 54", "Paused once, for 12.5 s in all."]);
  });

  test("a click still waiting out its input delay registers on the same P4 tick across a pause", async () => {
    async function walkOrders(pause: boolean) {
      localStorage.setItem(SAVED_SETTINGS, JSON.stringify({ version: 1, values: { use3dView: false, inputDelay: 1000 } }));
      const run = await openRun("/?seed=1&invincible=on");
      run.page.click("start");
      run.playTo(9);
      await run.click(RING_NORTH);
      run.play(100);
      if (pause) {
        run.page.click("pause");
        run.play(10_000);
        run.page.click("resume");
      }
      run.playTo(14);
      const orders = run.region.fightLog().rows.flatMap((row) => row.inputs.filter((input) => input.kind === "walk-ordered").map((input) => ({ tick: row.tick, input })));
      run.page.close();
      return orders;
    }
    const unpaused = await walkOrders(false);
    const paused = await walkOrders(true);

    const registered = [{ tick: 11, input: { kind: "walk-ordered", destination: { x: 5, y: 3 }, pace: "run-setting" } }];
    expect({ unpaused, paused }).toEqual({ unpaused: registered, paused: registered });
  });

  test("of nine clicks made while paused, the last decides where the player walks", async () => {
    const run = await openRun("/?seed=1&invincible=on");
    run.page.click("start");
    run.playTo(4);
    run.page.click("pause");
    for (let click = 0; click < 8; click++) await run.click({ x: 8, y: 3 });
    await run.click({ x: 3, y: 2 });
    run.page.click("resume");
    run.playTo(5);
    const orders = run.region.fightLog().rows.flatMap((row) => row.inputs.filter((input) => input.kind === "walk-ordered"));
    run.page.close();

    expect({ count: orders.length, last: orders.at(-1) }).toEqual({ count: 8, last: { kind: "walk-ordered", destination: { x: 3, y: 2 }, pace: "run-setting" } });
  });
});
