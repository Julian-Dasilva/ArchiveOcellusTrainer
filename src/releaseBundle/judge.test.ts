import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judgeRelease } from "./judge";

const BUDGET_KIB = 2000;
const MAIN = 2_000 * 1024;
const ENTRY_TEXT = `<select id="start_phase"> The full fight is in beta. Full fight (beta) on the drill page opens it`;

function writeSized(path: string, bytes: number, text: string) {
  if (text.length > bytes) throw new Error(`${path} text is longer than ${bytes} bytes`);
  writeFileSync(path, text.padEnd(bytes, " "));
}

type DistFiles = { main: string; mainBytes: number; chunk: string | null; rate: number | null };

function dist(mutate: (files: DistFiles) => void) {
  const root = mkdtempSync(join(tmpdir(), "release-bundle-"));
  const files: DistFiles = { main: ENTRY_TEXT, mainBytes: MAIN, chunk: null, rate: 0.1 };
  mutate(files);
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), `<script src="assets/main.aaa.js"></script>`);
  writeSized(join(root, "assets/main.aaa.js"), files.mainBytes, files.main);
  if (files.chunk !== null) writeSized(join(root, "assets/later.bbb.js"), 4 * 1024, files.chunk);
  if (files.rate !== null) writeFileSync(join(root, "telemetry.json"), JSON.stringify({ sampleRate: files.rate }));
  return root;
}

describe("release bundle", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  test("a release dist whose entry is the full fight passes at the budget, though the changelog still names the old button", () => {
    const root = dist(() => undefined);
    roots.push(root);
    expect(judgeRelease(root, BUDGET_KIB)).toEqual({ problems: [], pageKiB: 2000, budgetKiB: BUDGET_KIB });
  });

  test.each<{ name: string; mutate: (files: DistFiles) => void; problem: string }>([
    { name: "has no Start at selector", mutate: (files) => { files.main = "the drill"; }, problem: "the entry does not contain the full fight's Start at selector" },
    { name: "still ships the drill's controls", mutate: (files) => { files.main = `${ENTRY_TEXT} drill_controls`; }, problem: "the entry still contains the retired drill page's drill_controls" },
    { name: "still ships the Phase 4 drill button", mutate: (files) => { files.main = `${ENTRY_TEXT} phase_4_drill`; }, problem: "the entry still contains the retired drill page's phase_4_drill" },
    { name: "ships a sample rate of 1", mutate: (files) => { files.rate = 1; }, problem: "telemetry.json sampleRate is 1, not 0.1" },
    { name: "ships a sample rate of 0", mutate: (files) => { files.rate = 0; }, problem: "telemetry.json sampleRate is 0, not 0.1" },
    { name: "ships no telemetry.json", mutate: (files) => { files.rate = null; }, problem: "telemetry.json sampleRate is null, not 0.1" },
    { name: "ships the analytics beacon", mutate: (files) => { files.main = `${ENTRY_TEXT} https://static.cloudflareinsights.com/beacon.min.js`; }, problem: "assets/main.aaa.js contains beacon.min.js" },
    { name: "grows the entry by 1 KiB", mutate: (files) => { files.mainBytes = MAIN + 1024; }, problem: "/ scripts are 2001 KiB, over the 2000 KiB budget" },
    { name: "adds a later chunk", mutate: (files) => { files.chunk = "later"; }, problem: "/ scripts are 2004 KiB, over the 2000 KiB budget" },
  ])("a release dist that $name fails", ({ mutate, problem }) => {
    const root = dist(mutate);
    roots.push(root);
    expect(judgeRelease(root, BUDGET_KIB).problems).toContain(problem);
  });
});
