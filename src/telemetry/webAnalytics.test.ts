import { act } from "react";

const TOKEN = "0123456789abcdef0123456789abcdef";
const BEACON_SCRIPT = { src: "https://static.cloudflareinsights.com/beacon.min.js", beacon: `{"token":"${TOKEN}","spa":false}`, defer: true };

type Build = Readonly<{ token: string; sampleRate: number | null; optedOut: boolean }>;

async function openAFreshBuild({ token, sampleRate, optedOut }: Build) {
  vi.resetModules();
  vi.stubEnv("CF_WEB_ANALYTICS_TOKEN", token);
  if (optedOut) localStorage.setItem("archive-ocellus:perf-data", "off");
  let configReads = 0;
  const offline = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if (!String(input).endsWith("/telemetry.json")) return offline(input, init);
    configReads++;
    return Promise.resolve(sampleRate === null ? new Response("", { status: 404 }) : new Response(JSON.stringify({ sampleRate })));
  });
  const { loadPage } = await vi.importActual<typeof import("../content/ocellus/tests/page")>("../content/ocellus/tests/page");
  const page = loadPage("/?seed=1");
  await act(() => vi.advanceTimersByTimeAsync(32));
  const scripts = [...document.querySelectorAll("script")].map((script) => ({ src: script.src, beacon: script.dataset.cfBeacon, defer: script.defer }));
  const box = document.querySelector<HTMLInputElement>("input#perf_data")?.checked ?? null;
  page.close();
  return { scripts, configReads, box };
}

describe("Cloudflare Web Analytics", () => {
  beforeEach(() => {
    localStorage.clear();
    document.querySelectorAll("script").forEach((script) => script.remove());
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    document.querySelectorAll("script").forEach((script) => script.remove());
  });

  test.each([
    { name: "built with a token and sampled in", build: { token: TOKEN, sampleRate: 1, optedOut: false }, loaded: { scripts: [BEACON_SCRIPT], configReads: 1, box: true } },
    { name: "built with a token and sampled out at rate 0", build: { token: TOKEN, sampleRate: 0, optedOut: false }, loaded: { scripts: [BEACON_SCRIPT], configReads: 1, box: true } },
    { name: "built with a token and no readable telemetry.json", build: { token: TOKEN, sampleRate: null, optedOut: false }, loaded: { scripts: [BEACON_SCRIPT], configReads: 1, box: true } },
    { name: "built with a token and opted out", build: { token: TOKEN, sampleRate: 1, optedOut: true }, loaded: { scripts: [], configReads: 0, box: false } },
    { name: "built without a token", build: { token: "", sampleRate: 1, optedOut: false }, loaded: { scripts: [], configReads: 1, box: true } },
  ])("a page $name loads $loaded.scripts.length analytics scripts and reads telemetry.json $loaded.configReads times", async ({ build, loaded }) => {
    expect(await openAFreshBuild(build)).toEqual(loaded);
  });
});
