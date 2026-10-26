import { isDeepStrictEqual } from "node:util";
import { inflateSync } from "node:zlib";

export const same = (a, b) => a?.x === b.x && a?.y === b.y;
export const between = (rows, from, to) => rows.filter((row) => row.tick >= Number(from) && row.tick <= Number(to));
export const rowAt = (rows, t) => rows.find((row) => row.tick === Number(t));
export const kindOf = (rows, kind) => rows.flatMap((row) => row.events.filter((e) => e.kind === kind));
export const sameJson = (a, b) => isDeepStrictEqual(a, JSON.parse(b));
export const walkOrders = (log) => log.rows.flatMap((row) => row.inputs.filter((i) => i.kind === "walk-ordered").map((i) => i.destination));
export const walkPaces = (log) => log.rows.flatMap((row) => row.inputs.filter((i) => i.kind === "walk-ordered").map((i) => i.pace));
export const tilesUntilStop = (log, stop, order = 0) => {
  const ordered = log.rows.flatMap((row, at) => (row.inputs.some((i) => i.kind === "walk-ordered") ? [at] : []));
  const tiles = log.rows.slice(ordered[order]).map((row) => row.playerAtPostTick.tile);
  return tiles.slice(0, tiles.findIndex((tile) => same(tile, stop)) + 1);
};

export const fromCentreOf = (centreX, centreY) => (box) => {
  const o = JSON.parse(box);
  return { minX: Number(centreX) + o.minX, maxX: Number(centreX) + o.maxX, minY: Number(centreY) + o.minY, maxY: Number(centreY) + o.maxY };
};
export const onScheduleWithin = (soundTolerance) => (heard, expected) =>
  heard.length === expected.length && heard.every(([at, samples], i) => samples === expected[i][1] && Math.abs(at - expected[i][0]) <= Number(soundTolerance));

export const isGlow = (r, g, b) => b >= 120 && b - g >= 80 && r - g >= 50;
export const isSpotAnimGlow = (r, g, b) => b >= 110 && b - g >= 35 && r - g >= 25;
export const isSpotAnimShard = (r, g, b) => g <= 35 && b >= 100 && b - r >= 40;

export function pixels(bytes) {
  function decode(file) {
    const buf = bytes(file);
    let pos = 8, width = 0, height = 0, channels = 0;
    const idat = [];
    while (pos < buf.length) {
      const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
      if (type === "IHDR") [width, height, channels] = [data.readUInt32BE(0), data.readUInt32BE(4), { 2: 3, 6: 4 }[data[9]]];
      if (type === "IDAT") idat.push(data);
      pos += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(idat)), stride = width * channels, px = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? px[y * stride + i - channels] : 0, b = y ? px[(y - 1) * stride + i] : 0, c = y && i >= channels ? px[(y - 1) * stride + i - channels] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        px[y * stride + i] = (raw[y * (stride + 1) + 1 + i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][raw[y * (stride + 1)]]) & 255;
      }
    }
    return { width, height, channels, px };
  }
  function pixelShare(file, matches, area) {
    const { width, height, channels, px } = decode(file);
    const { minX, maxX, minY, maxY } = area ?? { minX: 0, maxX: width - 1, minY: 0, maxY: height - 1 };
    let hits = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const i = (y * width + x) * channels;
        if (matches(px[i], px[i + 1], px[i + 2])) hits++;
      }
    }
    return Math.round((100000 * hits) / ((maxX - minX + 1) * (maxY - minY + 1))) / 1000;
  }
  function spot(file, matches, area) {
    const { width, height, channels, px } = decode(file);
    const { minX, maxX, minY, maxY } = area ?? { minX: Math.floor(width * 0.4), maxX: Math.ceil(width * 0.6) - 1, minY: Math.floor(height * 0.45), maxY: Math.ceil(height * 0.6) - 1 };
    let hits = 0, sumX = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const i = (y * width + x) * channels;
        if (matches(px[i], px[i + 1], px[i + 2])) [hits, sumX] = [hits + 1, sumX + x];
      }
    }
    return { share: Math.round((100000 * hits) / ((maxX - minX + 1) * (maxY - minY + 1))) / 1000, dx: hits ? Math.round((1000 * (sumX / hits - (width - 1) / 2)) / width) / 1000 : null };
  }
  return { decode, pixelShare, spot };
}

export function hoverTextOf(decode, { LOADOUT_SLOT_Y, SUPPLY_BREW_SLOT, LOADOUT_SLOT_DY, SUPPLY_HOVER_NAME_PIXEL: hoverNamePixel }) {
  const brewY = Number(LOADOUT_SLOT_Y) + Math.floor(Number(SUPPLY_BREW_SLOT) / 4) * Number(LOADOUT_SLOT_DY);
  const nameRgb = [1, 3, 5].map((i) => parseInt(hoverNamePixel.slice(i, i + 2), 16));
  return function hoverText(file) {
    const { width, channels, px } = decode(file);
    const columns = (rgb) => {
      const xs = [];
      for (let y = Number(brewY) + 19; y <= Number(brewY) + 40; y++) {
        for (let x = 0; x < width; x++) if (rgb.every((v, c) => px[(y * width + x) * channels + c] === v)) xs.push(x);
      }
      return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
    };
    return { width, action: columns([255, 255, 255]), name: columns(nameRgb) };
  };
}

export function replacedRun({ waiting, firstTick, firstRow }, { SPAWN_TILE: spawn, LOADOUT_RANGED_WORN: worn, SUPPLY_INVENTORY: inventory }) {
  const from = JSON.parse(spawn), at = (tile) => tile?.x === from.x && tile?.y === from.y;
  return {
    waitsAtStart: waiting.reloaded && waiting.start && !waiting.pause && waiting.tick === 0 && waiting.ticking === false && waiting.rows === 0,
    carriesNoInput: firstTick.tick >= 1 && at(firstTick.player) && (firstTick.destination === null || at(firstTick.destination)) &&
      firstTick.weapon === JSON.parse(worn).weapon && firstTick.slot0 === JSON.parse(inventory)[0] &&
      firstRow !== null && firstRow.prayer === null && at(firstRow.tile) && firstRow.inputs.length === 0,
  };
}
