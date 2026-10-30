import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { captures } from "./units/loadouts.mjs";

const fixture = JSON.parse(fs.readFileSync("scripts/verify/fixtures/loadouts.json", "utf8"));
function verdict(change = () => {}) {
  const data = structuredClone(fixture.captures);
  change(data);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loadout-verdict-"));
  try {
    for (const file of captures()) {
      fs.writeFileSync(path.join(dir, file), file.endsWith(".json") ? JSON.stringify(data[file] ?? []) : "image capture");
    }
    const result = spawnSync(process.execPath, ["scripts/verify/judge.mjs", "loadouts", dir, "0", "1"], { env: { ...process.env, ...fixture.env }, encoding: "utf8" });
    assert.equal(result.error, undefined);
    return { status: result.status, ...JSON.parse(fs.readFileSync(path.join(dir, "verdict.json"), "utf8")) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("captured Low equipment and a Max shop edit in its first free slot pass the final verdict", () => {
  const result = verdict();
  assert.equal(result.status, 0);
  assert.equal(result.outcome, "passed");
  assert.ok(Object.values(result.checks).every(Boolean));
});
for (const [name, change] of [
  ["incorrect Low equipment", (data) => { data["loadout-tier.json"].player.equipped.necklace = null; }],
  ["an omitted-item list that differs from the tier", (data) => { data["loadout-tier-panel.json"].leftOut = "Not simulated yet, so left out: Emberlight, " + data["loadout-tier-panel.json"].leftOut; }],
]) {
  test(`guard: the final verdict rejects ${name}`, () => {
    const result = verdict(change);
    assert.equal(result.status, 1);
    assert.deepEqual(result.failed, ["tierLinkDressesTheTier"]);
  });
}
for (const [name, change] of [
  ["the shop item replacing occupied slot zero", (data) => { const bag = data["loadout-editor-applied.json"].inventory; bag[0] = 6685; bag[13] = null; }],
  ["a changed neighbouring inventory item", (data) => { data["loadout-editor-applied.json"].inventory[0] = 21902; }],
  ["an unpaused editor", (data) => { data["loadout-editor-draft.json"].paused = false; }],
  ["an unedited draft label", (data) => { data["loadout-editor-draft.json"].preset = "Max"; }],
  ["a missing shop entry", (data) => { data["loadout-editor-draft.json"].shop = []; }],
  ["the wrong applied preset", (data) => { data["loadout-editor-applied.json"].preset = "low"; }],
  ["an unapplied edit", (data) => { data["loadout-editor-applied.json"].edited = false; }],
]) {
  test(`guard: the final verdict rejects ${name}`, () => {
    const result = verdict(change);
    assert.equal(result.status, 1);
    assert.deepEqual(result.failed, ["editorEditStartsTheRestartedRun"]);
  });
}
