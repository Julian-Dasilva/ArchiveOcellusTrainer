#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { loadConfig } from "osrs-sdk-assets";

const SPRITE_INDEX = 8;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

const config = await loadConfig({ cwd: root, cacheDir: option("--cache-dir"), readerPath: option("--reader-path") });
const compiled = path.join(root, `.extract-sprites-${randomUUID()}.mjs`);
let assets;
try {
  await build({ entryPoints: [path.join(root, "src/assets.ts")], outfile: compiled, bundle: true, packages: "external", platform: "node", format: "esm", logLevel: "error" });
  assets = await import(pathToFileURL(compiled).href);
} finally {
  await rm(compiled, { force: true });
}
const targets = assets.ARCHIVE_OCELLUS_SPRITES.map((sprite) => ({ sprite, file: path.join(config.outDir, assets.spriteFile(sprite)) }));

const { RSCache } = await import(pathToFileURL(path.join(config.readerPath, "src/index.js")).href);
const { createCanvas } = createRequire(path.join(config.readerPath, "package.json"))("canvas");
const cache = new RSCache(path.join(config.cacheDir, String(config.cacheId), "cache") + path.sep);
await cache.onload;
try {
  for (const { sprite, file } of targets) {
    const frame = (await cache.getDef(SPRITE_INDEX, sprite.archive))?.sprites?.[sprite.frame];
    if (!frame?.width || !frame?.height) throw new Error(`sprite ${sprite.archive} has no frame ${sprite.frame} in cache ${config.cacheId}`);
    const canvas = createCanvas(frame.width, frame.height);
    const context = canvas.getContext("2d");
    const image = context.createImageData(frame.width, frame.height);
    // Some sprites (the fixed-mode tab stones among them) decode with every alpha at 0; as in a sprite without an alpha
    // channel, palette index 0 is then the only transparent colour.
    const noAlpha = frame.pixels.every((pixel) => pixel >>> 24 === 0);
    frame.pixels.forEach((pixel, index) => {
      const alpha = noAlpha ? (frame.pixelIdx[index] === 0 ? 0 : 255) : (pixel >>> 24) & 255;
      image.data.set([(pixel >> 16) & 255, (pixel >> 8) & 255, pixel & 255, alpha], index * 4);
    });
    context.putImageData(image, 0, 0);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, canvas.toBuffer("image/png"));
    console.log(`extract-sprites: wrote ${path.relative(root, file)} (sprite ${sprite.archive} frame ${sprite.frame}, ${frame.width}x${frame.height})`);
  }
} finally {
  cache.close();
}
