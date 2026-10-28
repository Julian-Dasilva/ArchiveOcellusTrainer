import { isDeepStrictEqual } from "node:util";
import { pixels, same, sameJson } from "../lib.mjs";

export const captures = () => [
  "hidden.json", "hidden.png", "before.json", "before.png", "before-centre.json", "after.json", "after.png", "edge-click.json", "edge-arrived.json", "edge.json", "edge.png",
  "boss.png", "boss-bar.json", "cycle-ring-click.json", "cycle-snapshot.json", "cycle.json", "console.log", "page-errors.json",
];

export function judge({ read, bytes, env }) {
  const { SPAWN_TILE: spawn, WALK_TARGET_TILE: target, EDGE_ORDER_TILE: edgeOrder, EDGE_STOP_TILE: edgeStop, EDGE_HOLD_TICKS: holdTicks, BOSS_NPC: bossNpc,
    CYCLE_LAST_HIDDEN_TICK: lastHiddenTick, CYCLE_LAST_TICK: lastTick, CYCLE_STAGE_ENTRIES: stages, CYCLE_OVERHEAD_SWITCHES: overheads, CYCLE_SPECIAL_HITS: specials,
    VOID_PIXEL: voidPixel, BOSS_BAR_AT_ENTRY: bossBarAtEntry, PRESENT_CENTRE_HALF_PX: half } = env;
  const { pixelShare } = pixels(bytes);
  const [hidden, before, after, edgeArrived, edge, cycle, snapshot] =
    ["hidden.json", "before.json", "after.json", "edge-arrived.json", "edge.json", "cycle.json", "cycle-snapshot.json"].map(read);
  const [spawnTile, targetTile, edgeOrderTile, edgeStopTile] = [spawn, target, edgeOrder, edgeStop].map((tile) => JSON.parse(tile));
  const upTo = (rows, last) => rows.filter((row) => row.tick <= last);
  const events = (rows, kind, pick) => upTo(rows, Number(lastTick)).flatMap((row) => row.events.filter((e) => e.kind === kind).map(pick));
  const want = [1, 3, 5].map((i) => parseInt(voidPixel.slice(i, i + 2), 16));
  // The fallen quadrants around the platform are as dark as the void, so the share reads the 5x5 alone.
  const centre = read("before-centre.json"), box = { minX: centre.x - Number(half), maxX: centre.x + Number(half), minY: centre.y - Number(half), maxY: centre.y + Number(half) };
  const voidShare = (file) => pixelShare(file, (...rgb) => want.every((v, c) => Math.abs(rgb[c] - v) <= 10), box);
  const bossBar = Object.entries(read("boss-bar.json")).map(([t, texts]) => [Number(t), texts]).sort(([a], [b]) => a - b);
  const observed = {
    bossBar,
    firstWalkOrders: cycle.rows.flatMap((row) => row.inputs.filter((i) => i.kind === "walk-ordered").map((i) => i.destination)).slice(0, 2),
    edge: { arrived: [edgeArrived.tick, edgeArrived.player], held: [edge.tick, edge.player] },
    stageEntries: events(cycle.rows, "stage-entered", (e) => [e.at, e.stage]),
    overheadSwitches: events(cycle.rows, "overhead-switched", (e) => [e.at, e.overhead]),
    specialHits: upTo(cycle.rows, Number(lastTick)).flatMap((row) => row.beats.filter((b) => b.kind === "special-hit").map((b) => [row.tick, b.variant])),
    voidPixelShare: { "before.png": voidShare("before.png") },
  };
  const share = observed.voidPixelShare;
  const checks = {
    spawnedOnSpawnTile: same(before.player, spawnTile),
    clickTargetedExpectedTile: same(after.destination, targetTile),
    arrivedAtExpectedTile: same(after.player, targetTile),
    worldTicked: after.tick > before.tick,
    edgeClickOrderedOffThePlatform: isDeepStrictEqual(observed.firstWalkOrders, [targetTile, edgeOrderTile]),
    stoppedAtTheEdge: same(edgeArrived.player, edgeStopTile) && same(edge.player, edgeStopTile) && edge.tick - edgeArrived.tick >= Number(holdTicks),
    bossIsExpectedNpc: snapshot.fight?.boss.npcId === Number(bossNpc),
    bossHiddenInLeadIn: hidden.fight?.run.kind === "running" && hidden.fight.run.tick <= Number(lastHiddenTick) && hidden.fight.boss.visible === false,
    bossDrawnOncePresent: snapshot.fight?.boss.visible === true,
    bossBarReadsEntryHpOncePresent: bossBar.some(([t]) => t === 12) && bossBar.filter(([t]) => t <= 12).every(([, texts]) => sameJson(texts, JSON.stringify([bossBarAtEntry]))),
    // Phase 4 carried from the third fall opens on P4 tick 1.
    logHasEveryTick: cycle.rows.every((row, index) => row.tick === index + 1) && cycle.rows.length >= Number(lastTick),
    stagesOnSchedule: sameJson(observed.stageEntries, stages),
    overheadsOnSchedule: sameJson(observed.overheadSwitches, overheads),
    transitionAttacksOnSchedule: sameJson(observed.specialHits, specials),
    noVoidBeforeTheFight: share["before.png"] < 0.3,
  };
  if (!checks.clickTargetedExpectedTile) {
    console.error(`verify: the click resolved to ${JSON.stringify(after.destination)}, not ${JSON.stringify(targetTile)}; the click-to-tile mapping for this viewport and camera changed`);
  }
  return { observed, checks };
}
