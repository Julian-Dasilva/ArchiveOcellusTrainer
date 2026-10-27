import { everyScriptBytes, kib, pageBytes, scriptRole } from "./pageScripts";
import type { BuiltScript } from "./pageScripts";

const DRILL_BUDGET_KIB = 1753;

/** Byte sizes of the release scripts measured at e4b47df. */
const RELEASE: readonly BuiltScript[] = [
  { path: "assets/main.aaa.js", bytes: 1_784_826, role: "entry" },
  { path: "assets/sidebar.bbb.js", bytes: 5_630, role: "sidebar" },
  { path: "assets/full-fight.ccc.js", bytes: 194_452, role: "full-fight" },
];

describe("page script bytes", () => {
  test("an entry, a sidebar chunk and a full-fight chunk take those roles", () => {
    const entries = new Set(["assets/main.aaa.js"]);
    expect([
      scriptRole("assets/main.aaa.js", entries),
      scriptRole("assets/sidebar.bbb.js", entries),
      scriptRole("assets/full-fight.ccc.js", entries),
      scriptRole("assets/vendor.ddd.js", entries),
    ]).toEqual(["entry", "sidebar", "full-fight", "other"]);
  });

  test("summing every script fails the 1753 KiB budget on the release build, and the / page passes", () => {
    expect({
      every: kib(everyScriptBytes(RELEASE)),
      drill: kib(pageBytes(RELEASE, "drill")),
      full: kib(pageBytes(RELEASE, "full")),
    }).toEqual({ every: 1939, drill: 1749, full: 1933 });
    expect(kib(everyScriptBytes(RELEASE))).toBeGreaterThan(DRILL_BUDGET_KIB);
    expect(kib(pageBytes(RELEASE, "drill"))).toBeLessThanOrEqual(DRILL_BUDGET_KIB);
  });

  test("growth in the / entry still fails the 1753 KiB budget", () => {
    const grown = RELEASE.map((script) => (script.role === "entry" ? { ...script, bytes: script.bytes + 6 * 1024 } : script));
    expect(kib(pageBytes(grown, "drill"))).toBeGreaterThan(DRILL_BUDGET_KIB);
  });
});
