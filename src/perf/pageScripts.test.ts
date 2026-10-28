import { htmlEntryPaths, kib, pageBytes } from "./pageScripts";
import type { BuiltScript } from "./pageScripts";

const RELEASE: readonly BuiltScript[] = [
  { path: "assets/main.aaa.js", bytes: 1_900_000, entry: true },
  { path: "assets/vendors.0123abcd.js", bytes: 60 * 1024, entry: false },
];

describe("page script bytes", () => {
  test("/ counts the entry and every other script the build emits", () => {
    expect(kib(pageBytes(RELEASE))).toBe(1916);
  });

  test("the minified page names its entry without quotes around the src", () => {
    expect([...htmlEntryPaths(`<script src=assets/main.aaa.js></script><script src="assets/quoted.bbb.js"></script>`)].sort()).toEqual([
      "assets/main.aaa.js",
      "assets/quoted.bbb.js",
    ]);
  });
});
