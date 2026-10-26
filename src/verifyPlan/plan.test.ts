import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const BROWSER_UNITS = readdirSync(resolve(ROOT, "scripts/verify/units")).map((file) => file.replace(/\.mjs$/, "")).sort();

const PLANNER = "./plan";

async function shipped() {
  const planner: typeof import("./plan") = await import(/* @vite-ignore */ PLANNER);
  const json: unknown = JSON.parse(readFileSync(resolve(ROOT, "scripts/verify-impact.json"), "utf8"));
  return { ...planner, impact: planner.parseImpact(json, BROWSER_UNITS) };
}

describe("verify plan", () => {
  test("the SDK pin selects every unit", async () => {
    const { impact, plan } = await shipped();
    const selected = plan(impact, ["scripts/install-beta-sdk.sh"]);
    expect(selected.tier).toBe("t2");
    expect(selected.units).toHaveLength(36);
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

  test("a unit's check module selects that unit", async () => {
    const { impact, plan } = await shipped();
    expect(plan(impact, ["scripts/verify/units/seed.mjs"]).units).toEqual(["seed"]);
  });

  test("two rules select the union of their units, browser units before stages", async () => {
    const { impact, plan } = await shipped();
    expect(plan(impact, ["src/hoverText.ts", "src/flags.ts"]).units).toEqual(["keybinds", "p3_drill", "supplies", "production"]);
  });

  test("the run command names the selected units and stages", async () => {
    const { impact, plan, runCommand } = await shipped();
    expect(runCommand(impact, plan(impact, ["src/flags.ts"]))).toBe("scripts/verify.sh t0 browser --unit p3_drill production");
    expect(runCommand(impact, plan(impact, ["src/perf/gate.ts"]))).toBe("scripts/verify.sh t0 perf");
    expect(runCommand(impact, plan(impact, ["README.md"]))).toBe("scripts/verify.sh t0");
    expect(runCommand(impact, plan(impact, ["src/sim/tiles.ts"]))).toBe("scripts/verify.sh t0 browser production perf");
  });

  test("a rule naming a unit that does not exist is refused", async () => {
    const { parseImpact } = await shipped();
    expect(() => parseImpact({ stages: {}, groups: {}, everything: [], t0Only: [], rules: [{ paths: ["src/x.ts"], units: ["boss_dance"] }] }, BROWSER_UNITS)).toThrow(
      "rule 0 names boss_dance, which is no unit",
    );
  });

  test("every path in the shipped map matches a tracked file", async () => {
    const { impact } = await shipped();
    const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    const globs = [...impact.everything, ...impact.t0Only, ...impact.rules.flatMap(({ globs }) => globs)];
    expect(globs.filter(({ pattern }) => !tracked.some((file) => pattern.test(file))).map(({ text }) => text)).toEqual([]);
  });
});
