import type { BuildFlags } from "../flags";

const CHECKER = "./phaseCode";

async function strayPhaseModules(sources: readonly string[], flags: BuildFlags) {
  const checker: typeof import("./phaseCode") = await import(/* @vite-ignore */ CHECKER);
  return checker.strayPhaseModules(sources, flags);
}

const SOURCES = [
  "webpack://archive-ocellus-trainer/./src/content/ocellus/js/OcellusRegion.ts",
  "webpack://archive-ocellus-trainer/./src/content/ocellus/js/P2Region.ts",
  "webpack://archive-ocellus-trainer/./src/content/ocellus/js/p3/arena.ts",
  "webpack://archive-ocellus-trainer/./src/content/ocellus/js/P3Region.ts",
  "webpack://archive-ocellus-trainer/./node_modules/osrs-sdk/_bundles/main.js",
];

describe("strayPhaseModules", () => {
  test.each([
    {
      flags: { p2: false, p3: false },
      strays: [
        { module: "src/content/ocellus/js/P2Region.ts", phases: ["p2"] },
        { module: "src/content/ocellus/js/p3/arena.ts", phases: ["p2", "p3"] },
        { module: "src/content/ocellus/js/P3Region.ts", phases: ["p3"] },
      ],
    },
    { flags: { p2: true, p3: false }, strays: [{ module: "src/content/ocellus/js/P3Region.ts", phases: ["p3"] }] },
    { flags: { p2: true, p3: true }, strays: [] },
  ])("with $flags, reports each emitted phase module whose phases are all off", async ({ flags, strays }) => {
    expect(await strayPhaseModules(SOURCES, { ...flags, p1: false })).toEqual(strays);
  });
});
