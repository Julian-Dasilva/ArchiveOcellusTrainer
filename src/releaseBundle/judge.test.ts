import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judgeRelease } from "./judge";

const BUDGET_KIB = 1753;
const MAIN = 1_784_826;
const SIDEBAR = 5_630;
const FULL = 194_452;

function writeSized(path: string, bytes: number, text: string) {
  if (text.length > bytes) throw new Error(`${path} text is longer than ${bytes} bytes`);
  writeFileSync(path, text.padEnd(bytes, " "));
}

type DistFiles = { main: string; sidebar: string | null; full: string | null; rate: number };

function dist(mutate: (files: DistFiles) => void) {
  const root = mkdtempSync(join(tmpdir(), "release-bundle-"));
  const files: DistFiles = { main: "assets/full-fight.ccc.js full_fight Full fight (beta)", sidebar: null, full: "phase page", rate: 0 };
  mutate(files);
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), `<script src="assets/main.aaa.js"></script>`);
  writeSized(join(root, "assets/main.aaa.js"), MAIN, files.main);
  if (files.sidebar !== null) writeSized(join(root, "assets/sidebar.bbb.js"), SIDEBAR, files.sidebar);
  if (files.full !== null) writeSized(join(root, "assets/full-fight.ccc.js"), FULL, files.full);
  writeFileSync(join(root, "telemetry.json"), JSON.stringify({ sampleRate: files.rate }));
  return root;
}

describe("release bundle", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  test("a release dist passes, with / under 1753 KiB and ?mode=full on its own line", () => {
    const root = dist(() => undefined);
    roots.push(root);
    expect(judgeRelease(root, BUDGET_KIB)).toEqual({ problems: [], drillKiB: 1743, fullFightKiB: 1933, budgetKiB: BUDGET_KIB });
  });

  test.each<{ name: string; mutate: (files: DistFiles) => void; problem: string }>([
    { name: "drops Full fight (beta)", mutate: (files) => { files.main = "assets/full-fight.ccc.js"; }, problem: "the entry does not contain the Full fight (beta) button" },
    { name: "keeps the button label only in the changelog", mutate: (files) => { files.main = "assets/full-fight.ccc.js The full fight is in beta. Full fight (beta) on the drill page opens it"; }, problem: "the entry does not contain the Full fight (beta) button" },
    { name: "splits the sidebar into its own chunk", mutate: (files) => { files.sidebar = "full_fight Full fight (beta)"; }, problem: "the sidebar is a separate chunk" },
    { name: "has no full-fight chunk", mutate: (files) => { files.full = null; }, problem: "?mode=full has no full-fight chunk" },
    { name: "does not reference the full-fight chunk", mutate: (files) => { files.main = "no chunk name"; }, problem: "the entry script does not reference the full-fight chunk" },
    { name: "ships a sample rate of 1", mutate: (files) => { files.rate = 1; }, problem: "telemetry.json sampleRate is 1, not 0" },
    { name: "ships the analytics beacon", mutate: (files) => { files.main = "assets/full-fight.ccc.js https://static.cloudflareinsights.com/beacon.min.js"; }, problem: "assets/main.aaa.js contains beacon.min.js" },
  ])("a release dist that $name fails", ({ mutate, problem }) => {
    const root = dist(mutate);
    roots.push(root);
    expect(judgeRelease(root, BUDGET_KIB).problems).toContain(problem);
  });

  test("a webpack map that stores the chunk name and the hash apart still references the chunk", () => {
    const root = dist((files) => {
      files.main = `{481:"full-fight"}[e]+"."+{481:"ccc"}[e]+".js" full_fight Full fight (beta)`;
    });
    roots.push(root);
    expect(judgeRelease(root, BUDGET_KIB).problems).toEqual([]);
  });

  test("growth in the / entry fails the 1753 KiB budget", () => {
    const root = mkdtempSync(join(tmpdir(), "release-bundle-"));
    roots.push(root);
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "index.html"), `<script src="assets/main.aaa.js"></script>`);
    writeSized(join(root, "assets/main.aaa.js"), MAIN + 12 * 1024, "assets/full-fight.ccc.js full_fight Full fight (beta)");
    writeSized(join(root, "assets/full-fight.ccc.js"), FULL, "phase page");
    writeFileSync(join(root, "telemetry.json"), JSON.stringify({ sampleRate: 0 }));
    expect(judgeRelease(root, BUDGET_KIB).problems).toContain("/ scripts are 1755 KiB, over the 1753 KiB budget");
  });
});
