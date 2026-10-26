import { inflateSync } from "node:zlib";

export const captures = () => [
  "p3-arena.png", "p3-arena-tiles.json", "p3-snapshot.json", "p3-boss-bar.json", "p3-swings.json", "p3-swings-console.log", "p3-swings-page-errors.json",
  "p3-panic.json", "p3-panic-console.log", "p3-panic-page-errors.json", "p3-chain.json", "p3-chain-page-errors.json", "p3-clear-panel.json", "p3-clear.png", "p3-clear.json", "p3-clear-console.log",
  "p3-clear-page-errors.json", "p3-start-p4.json", "p3-start-p4-page-errors.json",
];

export function judge({ read, bytes, env }) {
  const { BOSS_NPC: bossNpc, P3_SWINGS: swings, P3_PANIC: panic, P3_CLEAR: clear, P3_START_P4: startP4, P3_CHAIN: chain } = env;
  function decode(file) {
    const buf = bytes(file);
    let at = 8, width = 0, channels = 4;
    const idat = [];
    while (at < buf.length) {
      const len = buf.readUInt32BE(at), type = buf.toString("ascii", at + 4, at + 8), data = buf.subarray(at + 8, at + 8 + len);
      if (type === "IHDR") [width, channels] = [data.readUInt32BE(0), data[9] === 6 ? 4 : 3];
      if (type === "IDAT") idat.push(data);
      at += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(idat)), stride = width * channels, height = raw.length / (stride + 1), px = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? px[y * stride + i - channels] : 0, b = y ? px[(y - 1) * stride + i] : 0, c = y && i >= channels ? px[(y - 1) * stride + i - channels] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        px[y * stride + i] = (raw[y * (stride + 1) + 1 + i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][raw[y * (stride + 1)]]) & 255;
      }
    }
    return { width, channels, px };
  }
  const tileColours = () => {
    const { width, channels, px } = decode("p3-arena.png");
    const mean = ({ at }) => {
      if (!at) return null;
      const sum = [0, 0, 0];
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) for (let c = 0; c < 3; c++) sum[c] += px[((at.y + dy) * width + at.x + dx) * channels + c];
      return sum.map((v) => Math.round(v / 49));
    };
    return Object.fromEntries(Object.entries(read("p3-arena-tiles.json")).map(([kind, tiles]) => [kind, tiles.map(mean)]));
  };
  const lum = (rgb) => (rgb[0] + rgb[1] + rgb[2]) / 3;
  const grey = (rgb) => rgb !== null && Math.abs(rgb[1] - rgb[2]) < 20;
  const arena = tileColours();
  const arenaDrawn = ({ open, closed, rim }) => [...open, ...closed].every(grey) && rim.every((rgb) => rgb !== null && rgb[1] - rgb[2] >= 20) &&
    Math.min(...open.map(lum)) >= Math.max(...closed.map(lum)) + 12;
  const hits = (log) => log.rows.flatMap((row) => row.events).filter((event) => event.kind === "player-hit").map(({ at, hit, receipt }) => [at, hit.kind, receipt.requested, receipt.applied, receipt.prayer]);
  const [snapshot, bar, swingLog, panicLog, clearLog, panel, p4, chainLog] = ["p3-snapshot.json", "p3-boss-bar.json", "p3-swings.json", "p3-panic.json", "p3-clear.json", "p3-clear-panel.json", "p3-start-p4.json", "p3-chain.json"].map(read);
  const expectedClear = JSON.parse(clear), expectedStart = JSON.parse(startP4);
  const clearedAt = clearLog.rows.find((row) => row.events.some((event) => event.kind === "run-ended"));
  const observed = {
    arena,
    bossBar: [...new Set(Object.values(bar).flat())],
    swings: hits(swingLog).filter(([at, kind]) => kind === "swing" && at <= 17),
    prayerOrders: swingLog.rows.flatMap((row) => row.inputs.filter((input) => input.kind === "prayer-published").map((input) => [row.tick, input.prayer])),
    panic: hits(panicLog).filter(([at]) => at <= 10),
    chain: chainLog.rows.flatMap((row) => row.events).filter((event) => event.kind === "boss-moved" && event.at <= 90).map(({ at, move }) => [at, move]),
    escape: panicLog.rows.flatMap((row) => row.inputs.filter((input) => input.kind === "walk-ordered").map((input) => [row.tick, input.destination])),
    clear: { panel: { lines: panel.lines, buttons: panel.buttons }, run: panel.run, row: clearedAt && { tick: clearedAt.tick, bossHp: clearedAt.bossHp, events: clearedAt.events.map((event) => event.kind) } },
    startP4: p4,
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const checks = {
    p3BossIsNpc16677: swingLog.header.phase === "p3" && snapshot.fight?.boss.npcId === Number(bossNpc) && snapshot.fight.boss.visible && observed.bossBar.includes("5250 / 5250 (100.0%)"),
    p3ArenaDrawn: arenaDrawn(arena),
    p3SwingsChipUnderMeleePrayer: observed.prayerOrders.length > 0 && observed.prayerOrders[0][0] <= JSON.parse(swings)[0][0] && observed.prayerOrders[0][1] === "melee" && same(observed.swings, JSON.parse(swings)),
    p3PanicOutOfReach: same(observed.panic, JSON.parse(panic)) && observed.escape.length === 1,
    p3ChainAsRecorded: same(observed.chain, JSON.parse(chain)),
    p3InterimClear: same(observed.clear.panel, expectedClear.panel) && observed.clear.run?.kind === "ended" && observed.clear.run.reason.kind === "quadrant-cleared" &&
      observed.clear.row?.tick === expectedClear.tick && observed.clear.run.at === expectedClear.tick && observed.clear.row.bossHp.atPostTick === expectedClear.bossHp && observed.clear.row.events.includes("run-ended"),
    p3StartP4OpensP4: p4.search === expectedStart.search && p4.bossHp === expectedStart.bossHp && same(p4.rejected, []) && p4.logPhase === null && p4.phaseBox === "p4",
    noP3PageErrors: ["p3-swings-page-errors.json", "p3-panic-page-errors.json", "p3-chain-page-errors.json", "p3-clear-page-errors.json", "p3-start-p4-page-errors.json"].map(read).every((list) => list.length === 0),
  };
  return { observed, checks };
}
