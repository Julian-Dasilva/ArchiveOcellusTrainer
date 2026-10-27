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
        { module: "src/content/ocellus/js/p3/arena.ts", phases: ["p1", "p2", "p3"] },
        { module: "src/content/ocellus/js/P3Region.ts", phases: ["p3"] },
      ],
    },
    { flags: { p2: true, p3: false }, strays: [{ module: "src/content/ocellus/js/P3Region.ts", phases: ["p3"] }] },
    { flags: { p2: true, p3: true }, strays: [] },
  ])("with $flags, reports each emitted phase module whose phases are all off", async ({ flags, strays }) => {
    expect(await strayPhaseModules(SOURCES, { ...flags, p1: false, full: false })).toEqual(strays);
  });

  test.each([
    {
      flags: { p3: false, p2: false, p1: false, full: false },
      strays: [
        { module: "src/content/ocellus/js/P1Region.ts", phases: ["p1"] },
        { module: "src/content/ocellus/js/p3/arena.ts", phases: ["p1", "p2", "p3"] },
      ],
    },
    { flags: { p3: false, p2: false, p1: true, full: false }, strays: [] },
  ])("with $flags, P1's region is stray unless p1 is on, and P1 keeps P3's arena it builds on", async ({ flags, strays }) => {
    expect(await strayPhaseModules(["webpack://archive-ocellus-trainer/./src/content/ocellus/js/P1Region.ts", "webpack://archive-ocellus-trainer/./src/content/ocellus/js/p3/arena.ts"], { ...flags, full: false })).toEqual(strays);
  });

  test("a phase directory that is not on disk is named, and engine/ is not one of them", async () => {
    const checker: typeof import("./phaseCode") = await import(/* @vite-ignore */ CHECKER);
    expect(checker.missingPhaseDirectories((directory) => directory !== "src/content/ocellus/fight/")).toEqual(["src/content/ocellus/fight/"]);
    expect(checker.PHASE_DIRECTORIES.map(([directory]) => directory)).toEqual(["src/content/ocellus/full/", "src/content/ocellus/fight/"]);
  });

  test("a module under the full fight directories is stray unless full is on", async () => {
    const sources = ["webpack://archive-ocellus-trainer/./src/content/ocellus/full/prefix.ts", "webpack://archive-ocellus-trainer/./src/content/ocellus/fight/phase1.ts"];
    expect(await strayPhaseModules(sources, { p1: false, p2: false, p3: false, full: false })).toEqual([
      { module: "src/content/ocellus/full/prefix.ts", phases: ["full"] },
      { module: "src/content/ocellus/fight/phase1.ts", phases: ["full"] },
    ]);
    expect(await strayPhaseModules(sources, { p1: false, p2: false, p3: false, full: true })).toEqual([]);
  });
});
