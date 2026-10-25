import { Viewport } from "osrs-sdk";
import type { OcellusRegion } from "../content/ocellus/js/OcellusRegion";
import type { RunClock } from "../sim/sdk/RunClock";
import { CHANGELOG } from "../content/ocellus/changelog";
import { browserFamily, gpuFamily, webglRenderer } from "./device";
import type { PerfSummary } from "./perfSummary";
import { RunRecorder } from "./runRecorder";

const CONFIG_PATH = "telemetry.json";
const BEACON_PATH = "t";
const PERF_DATA_KEY = "archive-ocellus:perf-data";
const WEB_ANALYTICS_SCRIPT = "https://static.cloudflareinsights.com/beacon.min.js";
const WEB_ANALYTICS_TOKEN = process.env.CF_WEB_ANALYTICS_TOKEN ?? "";
const CANVAS_STEP_PX = 50;
const MAX_CORES = 64;

let unsavedChoice: boolean | null = null;

export function perfDataAllowed(): boolean {
  if (unsavedChoice !== null) return unsavedChoice;
  try {
    return localStorage.getItem(PERF_DATA_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setPerfDataAllowed(allowed: boolean): void {
  try {
    if (allowed) localStorage.removeItem(PERF_DATA_KEY);
    else localStorage.setItem(PERF_DATA_KEY, "off");
    unsavedChoice = null;
  } catch {
    unsavedChoice = allowed;
  }
}

export function loadWebAnalytics(): void {
  if (WEB_ANALYTICS_TOKEN === "" || !perfDataAllowed()) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = WEB_ANALYTICS_SCRIPT;
  script.dataset.cfBeacon = JSON.stringify({ token: WEB_ANALYTICS_TOKEN, spa: false });
  document.body.append(script);
}

async function sampleRate(): Promise<number | null> {
  try {
    const response = await fetch(new URL(CONFIG_PATH, window.location.href).href, { cache: "no-store" });
    if (!response.ok) return null;
    const config: unknown = await response.json();
    if (typeof config !== "object" || config === null || !("sampleRate" in config)) return null;
    const { sampleRate: rate } = config;
    return typeof rate === "number" && rate >= 0 && rate <= 1 ? rate : null;
  } catch {
    return null;
  }
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

function summarise(region: OcellusRegion, recorder: RunRecorder, sampleRate: number): PerfSummary | null {
  const run = region.snapshot()?.run;
  const rows = region.fightLog().rows;
  const last = rows[rows.length - 1];
  if (!run || run.kind === "waiting" || !last) return null;
  const { canvas } = Viewport.viewport;
  return {
    version: CHANGELOG[0].version,
    view: "3d",
    gpu: gpuFamily(webglRenderer()),
    browser: browserFamily(navigator.userAgent),
    stage: last.phase.stage,
    end: run.kind === "ended" ? run.reason : "left",
    sampleRate,
    ...recorder.timings(),
    devicePixelRatio: Math.round(window.devicePixelRatio * 100) / 100,
    canvasWidth: roundTo(canvas.width, CANVAS_STEP_PX),
    canvasHeight: roundTo(canvas.height, CANVAS_STEP_PX),
    cores: Math.min(navigator.hardwareConcurrency || 0, MAX_CORES),
  };
}

type Sampling = Readonly<{ kind: "waiting" }> | Readonly<{ kind: "measuring"; recorder: RunRecorder }> | Readonly<{ kind: "done" }>;

export async function startPerfTelemetry(region: OcellusRegion, clock: RunClock): Promise<void> {
  if (!perfDataAllowed()) return;
  const rate = await sampleRate();
  if (rate === null || Math.random() >= rate) return;
  const { world } = region;
  let sampling: Sampling = { kind: "waiting" };
  let seenTick = world.globalTickCounter;
  let pausedSince: number | null = null;

  const finish = () => {
    if (sampling.kind !== "measuring") return;
    const { recorder } = sampling;
    sampling = { kind: "done" };
    const summary = perfDataAllowed() ? summarise(region, recorder, rate) : null;
    if (summary) navigator.sendBeacon(new URL(BEACON_PATH, window.location.href).href, JSON.stringify(summary));
  };

  const onFrame = (now: number) => {
    if (sampling.kind === "done") return;
    window.requestAnimationFrame(onFrame);
    if (clock.state().kind === "paused") {
      pausedSince ??= now;
      return;
    }
    if (pausedSince !== null) {
      if (sampling.kind === "measuring") sampling.recorder.excludePause(now - pausedSince);
      pausedSince = null;
    }
    if (world.globalTickCounter !== seenTick) {
      seenTick = world.globalTickCounter;
      const run = region.snapshot()?.run;
      if (sampling.kind === "waiting" && run?.kind === "running") sampling = { kind: "measuring", recorder: new RunRecorder() };
      if (sampling.kind === "measuring") {
        sampling.recorder.tick(now);
        if (run?.kind === "ended") return finish();
      }
    }
    if (sampling.kind === "measuring") sampling.recorder.frame(now);
  };

  window.requestAnimationFrame(onFrame);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && finish());
  window.addEventListener("pagehide", finish);
}
