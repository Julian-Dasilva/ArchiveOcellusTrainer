import { createRequire } from "node:module";
import { resolve } from "node:path";
import { act } from "react";

const TOKEN = "0123456789abcdef0123456789abcdef";
const BEACON_SCRIPT = { src: "https://static.cloudflareinsights.com/beacon.min.js", beacon: `{"token":"${TOKEN}","spa":false}`, defer: true };

type Build = Readonly<{ token: string; sampleRate: number | null; optedOut: boolean }>;

const WEBPACK_CONFIG = resolve(__dirname, "../../webpack.config.js");

function tokenTheWebpackConfigDefines(environmentToken: string | null): string {
  const load = createRequire(WEBPACK_CONFIG);
  const saved = process.env.CF_WEB_ANALYTICS_TOKEN;
  if (environmentToken === null) delete process.env.CF_WEB_ANALYTICS_TOKEN;
  else process.env.CF_WEB_ANALYTICS_TOKEN = environmentToken;
  try {
    delete load.cache[WEBPACK_CONFIG];
    const config: unknown = load(WEBPACK_CONFIG);
    const plugins: readonly unknown[] = typeof config === "object" && config !== null && "plugins" in config && Array.isArray(config.plugins) ? config.plugins : [];
    const definitions: unknown = plugins.flatMap((plugin) => (typeof plugin === "object" && plugin !== null && plugin.constructor.name === "DefinePlugin" && "definitions" in plugin ? [plugin.definitions] : []))[0];
    const defined: unknown = typeof definitions === "object" && definitions !== null && "process.env.CF_WEB_ANALYTICS_TOKEN" in definitions ? definitions["process.env.CF_WEB_ANALYTICS_TOKEN"] : null;
    const token: unknown = typeof defined === "string" ? JSON.parse(defined) : null;
    if (typeof token !== "string") throw new Error("webpack.config.js defines no Web Analytics token");
    return token;
  } finally {
    if (saved === undefined) delete process.env.CF_WEB_ANALYTICS_TOKEN;
    else process.env.CF_WEB_ANALYTICS_TOKEN = saved;
  }
}

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

  test.each([
    { name: "without CF_WEB_ANALYTICS_TOKEN, as releases build", environmentToken: null, scripts: [] },
    { name: "with CF_WEB_ANALYTICS_TOKEN set", environmentToken: TOKEN, scripts: [BEACON_SCRIPT] },
  ])("guard: a page from the real webpack config built $name loads $scripts.length analytics scripts", async ({ environmentToken, scripts }) => {
    const token = tokenTheWebpackConfigDefines(environmentToken);
    const loaded = await openAFreshBuild({ token, sampleRate: 1, optedOut: false });
    expect(loaded.scripts).toEqual(scripts);
  });
});
