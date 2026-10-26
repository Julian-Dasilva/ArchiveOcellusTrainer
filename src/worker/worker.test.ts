import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DataPoint } from "../telemetry/perfSummary";
import type { Env } from "./worker";

const loadWorkerInEachTest = () => vi.importActual<typeof import("./worker")>("./worker");

const SUMMARY = {
  version: "2026.10.25.2",
  view: "3d",
  gpu: "nvidia",
  browser: "chrome",
  stage: "after-inner",
  end: "kill",
  sampleRate: 0.4,
  runTicks: 31,
  frames: 1100,
  frameMedianMs: 16,
  frameP95Ms: 33,
  frameP99Ms: 50,
  framesOver50Ms: 4,
  tickMedianMs: 600,
  tickP95Ms: 640,
  tickMaxMs: 812.5,
  lateTicks: 1,
  devicePixelRatio: 1.25,
  canvasWidth: 1600,
  canvasHeight: 1000,
  cores: 8,
};

function bindings() {
  const written: DataPoint[] = [];
  const env: Env = {
    ASSETS: { fetch: async (request) => new Response(`asset ${new URL(request.url).pathname}`) },
    PERF: { writeDataPoint: (point) => void written.push(point) },
  };
  return { env, written };
}

function bindingsDeclaredBy(configFile: string) {
  const config: unknown = JSON.parse(readFileSync(resolve(__dirname, "../..", configFile), "utf8"));
  const datasets: readonly unknown[] = typeof config === "object" && config !== null && "analytics_engine_datasets" in config && Array.isArray(config.analytics_engine_datasets) ? config.analytics_engine_datasets : [];
  const datasetBindings = datasets.map((dataset) => (typeof dataset === "object" && dataset !== null && "binding" in dataset ? String(dataset.binding) : "unnamed"));
  const { env, written } = bindings();
  const { PERF: _undeclared, ...assetsOnly } = env;
  return { env: datasetBindings.includes("PERF") ? env : assetsOnly, written, datasetBindings };
}

const SUMMARY_WITHOUT_CORES = Object.fromEntries(Object.entries(SUMMARY).filter(([key]) => key !== "cores"));
const versionOfBytes = (bytes: number) => `2026.10.25.${"1".repeat(bytes - "2026.10.25.".length)}`;
const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

async function send(env: Env, path: string, init?: RequestInit) {
  const { default: worker } = await loadWorkerInEachTest();
  const response = await worker.fetch(new Request(`https://trainer.example${path}`, init), env);
  return { status: response.status, body: await response.text() };
}

describe("Performance beacon Worker", () => {
  test("a valid summary posted to /t becomes one Analytics Engine data point in the documented order and answers 204", async () => {
    const { env, written } = bindings();
    const response = await send(env, "/t", { method: "POST", body: JSON.stringify(SUMMARY), headers: { "CF-Connecting-IP": "192.0.2.1", "User-Agent": "Mozilla/5.0 (a player's browser)" } });
    expect({ response, written }).toEqual({
      response: { status: 204, body: "" },
      written: [
        {
          blobs: ["2026.10.25.2", "3d", "nvidia", "chrome", "after-inner", "kill"],
          doubles: [0.4, 31, 1100, 16, 33, 50, 4, 600, 640, 812.5, 1, 1.25, 1600, 1000, 8],
          indexes: ["2026.10.25.2"],
        },
      ],
    });
  });

  test("guard: a 2D summary from a page loaded before the trainer dropped 2D answers 204 and keeps its 2d label", async () => {
    const { env, written } = bindings();
    const response = await send(env, "/t", { method: "POST", body: JSON.stringify({ ...SUMMARY, view: "2d" }) });
    expect({ status: response.status, written }).toEqual({
      status: 204,
      written: [
        {
          blobs: ["2026.10.25.2", "2d", "nvidia", "chrome", "after-inner", "kill"],
          doubles: [0.4, 31, 1100, 16, 33, 50, 4, 600, 640, 812.5, 1, 1.25, 1600, 1000, 8],
          indexes: ["2026.10.25.2"],
        },
      ],
    });
  });

  test.each([
    { name: "a body that is not JSON", init: { method: "POST", body: "{not json" }, status: 400 },
    { name: "a summary with an extra field", init: { method: "POST", body: JSON.stringify({ ...SUMMARY, userAgent: "Mozilla/5.0" }) }, status: 400 },
    { name: "a summary missing a field", init: { method: "POST", body: JSON.stringify({ ...SUMMARY, cores: undefined }) }, status: 400 },
    { name: "a GPU family outside the list", init: { method: "POST", body: JSON.stringify({ ...SUMMARY, gpu: "NVIDIA GeForce RTX 4090" }) }, status: 400 },
    { name: "a sample rate of 0", init: { method: "POST", body: JSON.stringify({ ...SUMMARY, sampleRate: 0 }) }, status: 400 },
    { name: "cores replaced by constructor", init: { method: "POST", body: JSON.stringify({ ...SUMMARY_WITHOUT_CORES, constructor: "unexpected" }) }, status: 400 },
    { name: "cores replaced by __proto__", init: { method: "POST", body: JSON.stringify({ ...SUMMARY_WITHOUT_CORES, ["__proto__"]: "unexpected" }) }, status: 400 },
    { name: "a version that makes a 111-byte index", init: { method: "POST", body: JSON.stringify({ ...SUMMARY, version: versionOfBytes(111) }) }, status: 400 },
    { name: "a body over 2 KB", init: { method: "POST", body: JSON.stringify({ ...SUMMARY, pad: "x".repeat(2048) }) }, status: 413 },
    { name: "a Content-Length over 2 KB", init: { method: "POST", body: JSON.stringify(SUMMARY), headers: { "content-length": "4096" } }, status: 413 },
    { name: "a GET", init: { method: "GET" }, status: 405 },
  ])("$name at /t writes nothing and answers $status", async ({ init, status }) => {
    const { env, written } = bindings();
    const response = await send(env, "/t", init);
    expect({ status: response.status, written }).toEqual({ status, written: [] });
  });

  test.each([
    { name: "guard: a 96-byte version", body: JSON.stringify({ ...SUMMARY, version: versionOfBytes(96) }), status: 204, point: { finiteDoubles: true, indexBytes: 96, blobBytes: 125 } },
    { name: "a 97-byte version", body: JSON.stringify({ ...SUMMARY, version: versionOfBytes(97) }), status: 400, point: null },
    { name: "guard: every double at its maximum", body: JSON.stringify({ ...SUMMARY, sampleRate: 1, runTicks: 1e7, frames: 1e7, frameMedianMs: 6e4, frameP95Ms: 6e4, frameP99Ms: 6e4, framesOver50Ms: 1e7, tickMedianMs: 6e4, tickP95Ms: 6e4, tickMaxMs: 6e4, lateTicks: 1e7, devicePixelRatio: 16, canvasWidth: 1e5, canvasHeight: 1e5, cores: 64 }), status: 204, point: { finiteDoubles: true, indexBytes: 12, blobBytes: 41 } },
    { name: "guard: every double at its minimum", body: JSON.stringify({ ...SUMMARY, sampleRate: Number.MIN_VALUE, runTicks: 0, frames: 0, frameMedianMs: 0, frameP95Ms: 0, frameP99Ms: 0, framesOver50Ms: 0, tickMedianMs: 0, tickP95Ms: 0, tickMaxMs: 0, lateTicks: 0, devicePixelRatio: 0, canvasWidth: 0, canvasHeight: 0, cores: 0 }), status: 204, point: { finiteDoubles: true, indexBytes: 12, blobBytes: 41 } },
    { name: "guard: cores of 1e309, which JSON reads as Infinity", body: JSON.stringify(SUMMARY).replace('"cores":8', '"cores":1e309'), status: 400, point: null },
    { name: "cores replaced by toString", body: JSON.stringify({ ...SUMMARY_WITHOUT_CORES, toString: 8 }), status: 400, point: null },
    { name: "cores replaced by hasOwnProperty", body: JSON.stringify({ ...SUMMARY_WITHOUT_CORES, hasOwnProperty: 8 }), status: 400, point: null },
  ])("$name answers $status, and any point it writes has finite doubles, an index of at most 96 bytes and blobs within 16 KB", async ({ body, status, point }) => {
    const { env, written } = bindings();
    const response = await send(env, "/t", { method: "POST", body });
    expect({
      status: response.status,
      points: written.map(({ blobs, doubles, indexes }) => ({
        finiteDoubles: doubles.every(Number.isFinite),
        indexBytes: utf8Bytes(indexes[0]),
        blobBytes: blobs.reduce((total, blob) => total + utf8Bytes(blob), 0),
      })),
    }).toEqual({ status, points: point ? [point] : [] });
  });

  test.each([
    { name: "guard: wrangler.jsonc declares the PERF dataset, and under its bindings", config: "wrangler.jsonc", datasets: ["PERF"], stored: 1 },
    { name: "wrangler.release.jsonc declares no Analytics Engine dataset, and under its bindings", config: "wrangler.release.jsonc", datasets: [], stored: 0 },
  ])("$name a valid summary at /t answers 204 and stores $stored data points, and / still serves", async ({ config, datasets, stored }) => {
    const { env, written, datasetBindings } = bindingsDeclaredBy(config);
    const responses = await Promise.all([send(env, "/t", { method: "POST", body: JSON.stringify(SUMMARY) }), send(env, "/")]);
    expect({ datasets: datasetBindings, responses, stored: written.length }).toEqual({
      datasets,
      responses: [
        { status: 204, body: "" },
        { status: 200, body: "asset /" },
      ],
      stored,
    });
  });

  test("every other path, including a POST, is served from the static assets", async () => {
    const { env, written } = bindings();
    const responses = await Promise.all([
      send(env, "/"),
      send(env, "/telemetry.json"),
      send(env, "/t/extra", { method: "POST", body: JSON.stringify(SUMMARY) }),
      send(env, "/osrs-assets/manifest.json"),
    ]);
    expect({ responses, written }).toEqual({
      responses: [
        { status: 200, body: "asset /" },
        { status: 200, body: "asset /telemetry.json" },
        { status: 200, body: "asset /t/extra" },
        { status: 200, body: "asset /osrs-assets/manifest.json" },
      ],
      written: [],
    });
  });
});
