import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  LOWEST_DEFENCE_FRACTION as oldLowest,
  NPC as oldNpc,
  P1 as oldP1,
  P2 as oldP2,
  P3 as oldP3,
  PARTY_SCALE as oldParty,
  PORTAL as oldPortal,
  PROTECT_MELEE_ICON as oldIcon,
  SEQ as oldSeq,
  SOUND as oldSound,
  SPOT as oldSpot,
  VOID_LOC as oldVoid,
  scaledHp as oldScaledHp,
} from "../fight/data";
import {
  LOWEST_DEFENCE_FRACTION,
  NPC,
  PARTY_SCALE,
  PORTAL,
  PROTECT_MELEE_ICON,
  SEQ,
  SOUND,
  SPOT,
  VOID_LOC,
  lowestDefenceFractionSourced,
  npcSourced,
  partyScaleSourced,
  portalSourced,
  protectMeleeIconSourced,
  scaledHp,
  seqSourced,
  soundSourced,
  spotSourced,
  voidLocSourced,
} from "../full/data/looks";
import { P1, p1Sourced } from "../full/data/p1";
import { P2, p2Sourced } from "../full/data/p2";
import { P3, p3Sourced } from "../full/data/p3";

const REPO = process.cwd();
const MODULES = ["looks.ts", "p1.ts", "p2.ts", "p3.ts"] as const;

const BASES = [
  "log-repeated",
  "footage-repeated",
  "footage-once",
  "spec-confirmed",
  "spec-single",
  "community-tested",
  "owner-estimated",
  "inferred",
  "assumption",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSelected(value: unknown): value is { kind: "selected"; value: unknown; evidence: Record<string, unknown> } {
  return isRecord(value) && value.kind === "selected" && isRecord(value.evidence);
}

function readLines(): Record<string, number> {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(REPO, "scripts/ocellus-sim-75bd193-lines.json"), "utf8"));
  if (!isRecord(parsed)) throw new Error("the ocellus-sim line index is not an object");
  const lines: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "number") throw new Error(`${key} is not a line number`);
    lines[key] = value;
  }
  return lines;
}

/** Every leaf is selected, and a path that exists in his pin cites that line. */
function expectSourced(sourced: unknown, raw: unknown, pathName: string, hisLines: Record<string, number>): void {
  if (isSelected(sourced)) {
    expect(sourced.value).toEqual(raw);
    expect(sourced.evidence.status).toBe("unverified");
    const basis = sourced.evidence.basis;
    expect(typeof basis === "string" && BASES.some((known) => known === basis)).toBe(true);
    const sources = sourced.evidence.sources;
    expect(Array.isArray(sources)).toBe(true);
    if (!Array.isArray(sources) || sources.length === 0 || !isRecord(sources[0])) {
      expect(sources).toEqual(["a citation list that starts with a wiki or no-wiki source"]);
      return;
    }
    expect(sources[0].kind === "wiki" || sources[0].kind === "no-wiki").toBe(true);
    if (sourced.evidence.basis === "log-repeated") {
      expect(sources.some((source) => isRecord(source) && source.kind === "fight-log")).toBe(true);
    }
    const hisLine = hisLines[pathName];
    if (hisLine !== undefined) {
      expect(
        sources.some(
          (source) =>
            isRecord(source) && source.kind === "ocellus-sim" && source.commit === "75bd193" && source.at === `data.ts:${hisLine}`,
        ),
      ).toBe(true);
    } else {
      expect(sources.some((source) => isRecord(source) && source.kind === "ocellus-sim")).toBe(false);
    }
    return;
  }
  if (!isRecord(sourced) || !isRecord(raw)) {
    expect(sourced).toEqual(raw);
    return;
  }
  expect(Object.keys(sourced).sort()).toEqual(Object.keys(raw).sort());
  for (const key of Object.keys(raw)) {
    const child = `${pathName}.${key}`;
    expectSourced(sourced[key], raw[key], child, hisLines);
  }
}

function digest(): string {
  const hash = createHash("sha256");
  for (const name of MODULES) {
    hash.update(fs.readFileSync(path.join(REPO, "src/content/ocellus/full/data", name)));
  }
  return hash.digest("hex");
}

describe("sourced fight data", () => {
  const hisLines = readLines();

  test("the projections equal the unsourced fight data", () => {
    expect(NPC).toEqual(oldNpc);
    expect(SEQ).toEqual(oldSeq);
    expect(SPOT).toEqual(oldSpot);
    expect(SOUND).toEqual(oldSound);
    expect(PORTAL).toEqual(oldPortal);
    expect(VOID_LOC).toEqual(oldVoid);
    expect(LOWEST_DEFENCE_FRACTION).toEqual(oldLowest);
    expect(PARTY_SCALE).toEqual(oldParty);
    expect(PROTECT_MELEE_ICON).toEqual(oldIcon);
    expect(P1).toEqual(oldP1);
    expect(P2).toEqual(oldP2);
    expect(P3).toEqual(oldP3);
  });

  test("every value is selected, and his pin is cited only where he wrote the value", () => {
    expectSourced(npcSourced, NPC, "NPC", hisLines);
    expectSourced(seqSourced, SEQ, "SEQ", hisLines);
    expectSourced(spotSourced, SPOT, "SPOT", hisLines);
    expectSourced(soundSourced, SOUND, "SOUND", hisLines);
    expectSourced(portalSourced, PORTAL, "PORTAL", hisLines);
    expectSourced(voidLocSourced, VOID_LOC, "VOID_LOC", hisLines);
    expectSourced(lowestDefenceFractionSourced, LOWEST_DEFENCE_FRACTION, "LOWEST_DEFENCE_FRACTION", hisLines);
    expectSourced(partyScaleSourced, PARTY_SCALE, "PARTY_SCALE", hisLines);
    expectSourced(protectMeleeIconSourced, PROTECT_MELEE_ICON, "PROTECT_MELEE_ICON", hisLines);
    expectSourced(p1Sourced, P1, "P1", hisLines);
    expectSourced(p2Sourced, P2, "P2", hisLines);
    expectSourced(p3Sourced, P3, "P3", hisLines);
  });

  test("the shadow slash landing is the one count the fight logs repeat", () => {
    expect(p3Sourced.slashLands.evidence.basis).toBe("log-repeated");
    expect(P3.slashLands).toBe(1);
  });

  test("party scaling still rounds half away from zero onto tens", () => {
    expect(scaledHp(2500, 4)).toBe(4680);
    expect(scaledHp(2500, 4)).toBe(oldScaledHp(2500, 4));
    for (const party of [1, 2, 3, 5, 8]) {
      expect(scaledHp(5250, party)).toBe(oldScaledHp(5250, party));
    }
  });

  test("running the codemod again does not change the modules", () => {
    const before = digest();
    execFileSync("node", ["scripts/source-fight-data.mjs"], { cwd: REPO });
    expect(digest()).toBe(before);
  });
});
