import { createHash } from "node:crypto";
import { loadConfig } from "osrs-sdk-assets";
import { ARCHIVE_OCELLUS_SPRITES, spriteFile } from "../src/assets.ts";
const [soundPackFile] = process.argv.slice(2);
const { cacheId, assets, scenes } = await loadConfig();
const requirements = JSON.parse(JSON.stringify({ assets, scenes }));
const payload = (key) => createHash("sha256").update(key).digest("hex") + ".bin";
const ids = (category) => Object.entries(requirements.assets[category]).map(([name, { id }]) => [name, id]);
const keyed = (category, key, value) => Object.fromEntries(ids(category).map(([name, id]) => [key(id), value(id, name)]));
const manifest = (source, { spotAnims = keyed("spotAnims", (id) => id, (id) => "spotanim-" + id), withoutAsset } = {}) => {
  const references = { ...keyed("npcs", (id) => "npc:" + id, (id) => ["npc-" + id]), ...keyed("models", (id) => "model:" + id, (id) => ["model-" + id]) };
  const playerItems = keyed("items", (id) => "item:" + id, (_, name) => "player-item-" + name.toLowerCase());
  const keys = [...Object.values(references).flat(), ...Object.values(spotAnims), ...new Set(Object.values(playerItems)), "player-animations"].filter((key) => key !== withoutAsset);
  return JSON.stringify({
    schemaVersion: 3,
    bundleVersion: "test",
    cache: { revision: 241, source, contentHash: "test" },
    assets: Object.fromEntries(keys.map((key) => [key, { file: payload(key), crc32: "0" }])),
    references,
    playerItems,
    spotAnims,
    sharedAssets: { playerAnimations: "player-animations" },
    soundEffects: { file: soundPackFile, crc32: "0" },
  });
};
const soundPack = (soundIds) => {
  const pack = Buffer.alloc(6 + 4 * soundIds.length);
  pack.write("SFX1", 0, "latin1");
  pack.writeUInt16BE(soundIds.length, 4);
  soundIds.forEach((id, n) => pack.writeUInt16BE(id, 6 + 4 * n));
  return pack;
};
const current = manifest("openrs2:" + cacheId);
const { explosion, ...olderSpotAnims } = requirements.assets.spotAnims;
const { swing, panic, shadowSlash, ...olderAnimations } = requirements.assets.npcs.ocellus.animations;
const olderAssets = { ...requirements.assets, spotAnims: olderSpotAnims, npcs: { ...requirements.assets.npcs, ocellus: { ...requirements.assets.npcs.ocellus, animations: olderAnimations } } };
const withoutExplosion = Object.fromEntries(Object.entries(keyed("spotAnims", (id) => id, (id) => "spotanim-" + id)).filter(([id]) => id !== String(explosion.id)));
const complete = {
  "build-info.json": JSON.stringify({ cache: { openrs2: cacheId }, requirements }),
  "manifest.json": current,
  ...Object.fromEntries(Object.keys(JSON.parse(current).assets).map((key) => [payload(key), "payload"])),
  [soundPackFile]: soundPack(ids("sounds").map(([, id]) => id)),
  ...Object.fromEntries(ARCHIVE_OCELLUS_SPRITES.map((sprite) => [spriteFile(sprite), "png"])),
};
const bundles = {
  complete: {},
  beforeExplosion: {
    "build-info.json": JSON.stringify({ cache: { openrs2: cacheId }, requirements: { ...requirements, assets: olderAssets } }),
    "manifest.json": manifest("openrs2:" + cacheId, { spotAnims: withoutExplosion }),
  },
  otherCache: { "build-info.json": JSON.stringify({ cache: { openrs2: 2745 }, requirements }), "manifest.json": manifest("openrs2:2745") },
  staleManifest: { "manifest.json": manifest("openrs2:" + cacheId, { spotAnims: withoutExplosion }) },
  manifestFromOtherCache: { "manifest.json": manifest("openrs2:2745") },
  manifestWithoutOcellus: { "manifest.json": JSON.stringify({ ...JSON.parse(current), references: { ...JSON.parse(current).references, ["npc:" + requirements.assets.npcs.ocellus.id]: undefined } }) },
  manifestWithoutBrazierOrAhrimsTop: {
    "manifest.json": JSON.stringify({
      ...JSON.parse(current),
      references: { ...JSON.parse(current).references, ["model:" + requirements.assets.models.brazier.id]: undefined },
      playerItems: { ...JSON.parse(current).playerItems, ["item:" + requirements.assets.items.ahrimsRobeTop.id]: undefined },
    }),
  },
  manifestWithoutPlayerAnimations: { "manifest.json": JSON.stringify({ ...JSON.parse(current), sharedAssets: undefined }) },
  manifestWithoutExplosionAsset: { "manifest.json": manifest("openrs2:" + cacheId, { withoutAsset: "spotanim-" + explosion.id }) },
  manifestWithoutSoundPack: { "manifest.json": JSON.stringify({ ...JSON.parse(current), soundEffects: undefined }) },
  soundPackWithoutEquipBackpack: { [soundPackFile]: soundPack(ids("sounds").filter(([name]) => name !== "equipBackpack").map(([, id]) => id)) },
};
const encode = (files) => Object.fromEntries(Object.entries(files).map(([file, content]) => [file, Buffer.from(content).toString("base64")]));
console.log(JSON.stringify(Object.fromEntries(Object.entries(bundles).map(([name, files]) => [name, encode({ ...complete, ...files })]))));
