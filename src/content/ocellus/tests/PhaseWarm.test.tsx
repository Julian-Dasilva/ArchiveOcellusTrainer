import React, { act } from "react";
import { CacheRenderInstancedModel, CacheRenderModel, SoundCache, TrainerInstance } from "osrs-sdk";
import type { TrainerLoadingState } from "osrs-sdk";
import type { MockInstance } from "vitest";
import { FullFightPage } from "../full/page";
import { mountPage } from "./page";

const READY: TrainerLoadingState = { assetProgress: 1, assetsLoaded: 0, assetsReady: true, assetsTotal: 0, imagesReady: true, status: "ready", viewportReady: true };
const LONGER_THAN_ANY_IDLE_WAIT_MS = 10_000;

const idleTimePasses = () => act(() => vi.advanceTimersByTimeAsync(LONGER_THAN_ANY_IDLE_WAIT_MS));

// jsdom has no idle callbacks, so the second browser's are built on the faked timers.
const BROWSERS = [
  { name: "a browser without idle callbacks", install: () => {} },
  {
    name: "a browser with idle callbacks",
    install: () => {
      vi.stubGlobal("requestIdleCallback", (run: IdleRequestCallback) => window.setTimeout(() => run({ didTimeout: false, timeRemaining: () => 50 }), 0));
      vi.stubGlobal("cancelIdleCallback", (handle: number) => window.clearTimeout(handle));
    },
  },
] as const;

describe.each(BROWSERS)("warming later phases in $name", ({ install }) => {
  let finishBossModel = () => {};
  let models: MockInstance<CacheRenderModel["preload"]>;
  let sounds: MockInstance<typeof SoundCache.preload>;
  const loadsStarted = () => models.mock.calls.length + sounds.mock.calls.length;
  let startedBeforeIdle = 0;
  const warmLoadsStarted = () => loadsStarted() - startedBeforeIdle;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    install();
    vi.spyOn(TrainerInstance.prototype, "load").mockImplementation(async (options) => options?.onStateChange?.(READY));
    // jsdom cannot read the asset cache, so the loads stand in for it and the test decides when the boss model is built.
    models = vi.spyOn(CacheRenderModel.prototype, "preload").mockImplementation(() => new Promise((resolve) => (finishBossModel = resolve)));
    vi.spyOn(CacheRenderInstancedModel.prototype, "preload").mockResolvedValue();
    sounds = vi.spyOn(SoundCache, "preload").mockImplementation(() => new Promise<AudioBuffer>(() => undefined));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function openReadyPage() {
    const page = mountPage("/", <FullFightPage />);
    await act(() => Promise.resolve());
    startedBeforeIdle = loadsStarted();
    return page;
  }

  test("guard: while the page is open, idle time builds phase 4's boss model and then moves on to the sounds", async () => {
    const page = await openReadyPage();
    expect(warmLoadsStarted()).toBe(0);
    await idleTimePasses();
    expect(models).toHaveBeenCalledTimes(1);
    expect(warmLoadsStarted()).toBe(1);
    finishBossModel();
    await idleTimePasses();
    expect(warmLoadsStarted()).toBe(2);
    page.close();
  });

  test("closing the page drops a warm job still waiting for idle time and every job queued after it", async () => {
    const page = await openReadyPage();
    page.close();
    await idleTimePasses();
    expect(warmLoadsStarted()).toBe(0);
  });

  test("a warm job that finishes after the page closed asks the window for no more idle time and starts no other job", async () => {
    const page = await openReadyPage();
    await idleTimePasses();
    expect(warmLoadsStarted()).toBe(1);
    page.close();
    const timersRequested = vi.spyOn(window, "setTimeout");
    finishBossModel();
    await idleTimePasses();
    expect(timersRequested).not.toHaveBeenCalled();
    expect(warmLoadsStarted()).toBe(1);
  });
});
