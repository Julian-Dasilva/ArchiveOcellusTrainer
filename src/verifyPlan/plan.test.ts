import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const BROWSER_UNITS = readdirSync(resolve(ROOT, "scripts/verify/units")).map((file) => file.replace(/\.mjs$/, "")).sort();

const PLANNER = "./plan";
const MAP = "scripts/verify-impact.json";

async function shipped() {
  const planner: typeof import("./plan") = await import(/* @vite-ignore */ PLANNER);
  const json: Readonly<Record<string, unknown> & { groups: Readonly<Record<string, readonly string[]>> }> = JSON.parse(readFileSync(resolve(ROOT, MAP), "utf8"));
  return { ...planner, json, impact: planner.parseImpact(json, BROWSER_UNITS, MAP) };
}

describe("verify plan", () => {
  test("the SDK pin selects every unit", async () => {
    const { impact, plan } = await shipped();
    const selected = plan(impact, ["scripts/install-beta-sdk.sh"]);
    expect(selected.tier).toBe("t2");
    expect(selected.units).toHaveLength(32);
    expect(selected.units).toContain("layered_present");
    expect(selected.selections).toEqual([{ kind: "everything", path: "scripts/install-beta-sdk.sh", glob: "scripts/install-beta-sdk.sh" }]);
  });

  test("a sim change selects every unit even beside a docs change", async () => {
    const { impact, plan } = await shipped();
    expect(plan(impact, ["README.md", "src/sim/combat.ts"]).tier).toBe("t2");
  });

  test("a path no rule names selects every unit", async () => {
    const { impact, plan } = await shipped();
    expect(plan(impact, ["src/newScreen.tsx"])).toEqual({ tier: "t2", units: impact.units, selections: [{ kind: "unknown", path: "src/newScreen.tsx" }] });
  });

  test("docs and tests select no unit", async () => {
    const { impact, plan } = await shipped();
    expect(plan(impact, ["README.md", ".claude/skills/verify-archive-ocellus/SKILL.md", "src/content/ocellus/tests/U4-explosions.test.ts"])).toEqual({
      tier: "t0",
      units: [],
      selections: [
        { kind: "nothing", path: ".claude/skills/verify-archive-ocellus/SKILL.md", glob: ".claude/**" },
        { kind: "nothing", path: "README.md", glob: "README.md" },
        { kind: "nothing", path: "src/content/ocellus/tests/U4-explosions.test.ts", glob: "**/*.test.ts" },
      ],
    });
  });

  test("an explosion change selects the explosion units", async () => {
    const { impact, plan } = await shipped();
    expect(plan(impact, ["src/content/ocellus/js/p4/explosions.ts"]).units).toEqual(["dodge_speedup", "explosion_run_end", "explosions"]);
  });

  test("a change to the page or the app that mounts the 3D view selects the layered present unit", async () => {
    const { impact, plan } = await shipped();
    expect(plan(impact, ["src/index.html"]).units).toContain("layered_present");
    expect(plan(impact, ["src/ArchiveOcellusApp.tsx"]).units).toContain("layered_present");
    expect(plan(impact, ["src/hoverText.ts"]).units).not.toContain("layered_present");
  });

  test("a unit's check module selects that unit", async () => {
    const { impact, plan } = await shipped();
    expect(plan(impact, ["scripts/verify/units/walkway.mjs"]).units).toEqual(["walkway"]);
  });

  test("two rules select the union of their units, browser units before stages", async () => {
    const { impact, plan } = await shipped();
    expect(plan(impact, ["src/hoverText.ts", "src/telemetry/perfTelemetry.ts"]).units).toEqual(["keybinds", "supplies", "telemetry", "production"]);
  });

  test("the run command names the selected units and stages", async () => {
    const { impact, plan, runCommand } = await shipped();
    expect(runCommand(impact, plan(impact, ["src/telemetry/perfTelemetry.ts"]))).toBe("scripts/verify.sh t0 browser --unit telemetry production");
    expect(runCommand(impact, plan(impact, ["src/perf/gate.ts"]))).toBe("scripts/verify.sh t0 perf");
    expect(runCommand(impact, plan(impact, ["README.md"]))).toBe("scripts/verify.sh t0");
    expect(runCommand(impact, plan(impact, ["src/sim/tiles.ts"]))).toBe("scripts/verify.sh t0 browser production perf");
  });

  test("a rule naming a unit that does not exist is refused", async () => {
    const { parseImpact } = await shipped();
    expect(() => parseImpact({ stages: {}, groups: {}, everything: [], t0Only: [], rules: [{ paths: ["src/x.ts"], units: ["boss_dance"] }] }, BROWSER_UNITS, MAP)).toThrow(
      "rule 0 names boss_dance, which is no unit",
    );
  });

  test("an emptied group is refused", async () => {
    const { parseImpact, json } = await shipped();
    expect(() => parseImpact({ ...json, groups: { ...json.groups, orbs: [] } }, BROWSER_UNITS, MAP)).toThrow("group orbs has no units");
  });

  test("a rule that selects no unit is refused", async () => {
    const { parseImpact } = await shipped();
    expect(() => parseImpact({ stages: {}, groups: {}, everything: [], t0Only: [], rules: [{ paths: ["src/x.ts"], units: [] }] }, BROWSER_UNITS, MAP)).toThrow(
      "rule 0 has no units",
    );
  });

  test("a change to the impact map selects every unit, even where the map calls it T0 only", async () => {
    const { parseImpact, plan, json } = await shipped();
    const demoted = parseImpact({ ...json, t0Only: [MAP] }, BROWSER_UNITS, MAP);
    expect(plan(demoted, [MAP, "src/content/ocellus/js/p4/orb.ts"])).toEqual({
      tier: "t2",
      units: demoted.units,
      selections: [
        { kind: "everything", path: MAP, glob: MAP },
        { kind: "units", path: "src/content/ocellus/js/p4/orb.ts", units: ["cues", "lifeforce_orb", "orb_late_and_entry", "recorded_fights"], globs: ["src/content/ocellus/js/p4/orb.ts"] },
      ],
    });
  });

  test("the changelog release commit selects whats new and production", async () => {
    const { impact, plan } = await shipped();
    const sha = execFileSync("git", ["rev-parse", "23af5717cb"], { cwd: ROOT, encoding: "utf8" }).trim();
    const paths = execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", sha], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((line) => line !== "");
    const selected = plan(impact, paths);
    expect(selected.tier).toBe("t1");
    expect(selected.units).toEqual(["whats_new", "production"]);
  });

  test("the explosion behaviour commit selects every unit, and the explosion file still names its three units", async () => {
    const { impact, plan, select } = await shipped();
    const sha = execFileSync("git", ["rev-parse", "9a50b3a"], { cwd: ROOT, encoding: "utf8" }).trim();
    const paths = execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", sha], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((line) => line !== "");
    const selected = plan(impact, paths);
    expect(selected.tier).toBe("t2");
    expect(selected.units).toEqual(impact.units);
    expect(select(impact, "src/content/ocellus/js/p4/explosions.ts")).toEqual({
      kind: "units",
      path: "src/content/ocellus/js/p4/explosions.ts",
      units: ["dodge_speedup", "explosion_run_end", "explosions"],
      globs: ["src/content/ocellus/js/p4/explosions.ts"],
    });
    for (const unit of ["dodge_speedup", "explosion_run_end", "explosions"]) expect(selected.units).toContain(unit);
  });

  test("a handoff stays local, drives the selected stages, or defers every unit", async () => {
    const { impact, plan, handoff } = await shipped();
    expect(handoff(impact, plan(impact, ["README.md"]))).toEqual({ kind: "local", tier: "t0" });
    expect(handoff(impact, plan(impact, ["src/content/ocellus/changelog.ts"]))).toEqual({ kind: "drive", tier: "t1", browser: ["whats_new"], stages: ["production"] });
    expect(handoff(impact, plan(impact, ["src/perf/gate.ts"]))).toEqual({ kind: "drive", tier: "t1", browser: [], stages: ["perf"] });
    expect(handoff(impact, plan(impact, ["src/sim/tiles.ts"])).kind).toBe("defer");
  });

  test("the planner writes the handoff file t1 reads", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-plan-"));
    const file = join(dir, "handoff.json");
    const output = execFileSync("node", ["node_modules/.bin/tsx", "src/verifyPlan/main.ts", MAP, "scripts/verify/units", "--handoff", file, "--", "src/content/ocellus/changelog.ts"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(output).toContain("plan: handoff drive");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ kind: "drive", tier: "t1", browser: ["whats_new"], stages: ["production"] });
  });

  test("every path in the shipped map matches a tracked file", async () => {
    const { impact } = await shipped();
    const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    const globs = [...impact.everything, ...impact.t0Only, ...impact.rules.flatMap(({ globs }) => globs)];
    expect(globs.filter(({ pattern }) => !tracked.some((file) => pattern.test(file))).map(({ text }) => text)).toEqual([]);
  });
});
