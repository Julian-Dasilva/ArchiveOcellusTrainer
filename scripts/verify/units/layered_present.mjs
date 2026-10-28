import { pixels } from "../lib.mjs";

const FRAMES = ["resized", "scaled", "paused", "context-restored"];

export const captures = () => [
  "present-webgl-hooks.js", "tile-clicks.jsonl", "present-resumed.json", "present-context-lost.json", "present-context-lost.png", "present-context-restored-live.json",
  "present-context-restored-live.png", "present-paused-held-screen.png", "present-console.log", "present-page-errors.json",
  ...FRAMES.flatMap((frame) => [`present-${frame}.json`, `present-${frame}-expected.png`, `present-${frame}-screen.png`]),
];

export function judge({ read, text, bytes, env }) {
  const {
    PRESENT_RESIZED_VIEWPORT: resizedViewport, PRESENT_DEVICE_SCALE: deviceScale, PRESENT_CENTRE_HALF_PX: centreHalf, PRESENT_LIT_LEVEL_SUM: litLevelSum,
    PRESENT_DRAWN_MIN_SHARE: drawnMin, PRESENT_LOST_MAX_SHARE: lostMax, PRESENT_LEVEL_TOLERANCE: tolerance, PRESENT_MAX_OFF_SHARE: maxOff, PRESENT_CONTEXT_LOST_LOG: lostLog,
  } = env;
  const png = pixels(bytes).decode;
  const decode = (file) => {
    const { width, height, channels, px } = png(file);
    return { width, height, at: (x, y) => [0, 1, 2].map((c) => px[(y * width + x) * channels + c]) };
  };
  const round = (share) => Math.round(share * 1000) / 1000;
  const litShare = (screen, centre, scale, excluded = () => false) => {
    if (!centre) return 0;
    let lit = 0, all = 0;
    for (let y = centre.y - Number(centreHalf); y <= centre.y + Number(centreHalf); y++) {
      for (let x = centre.x - Number(centreHalf); x <= centre.x + Number(centreHalf); x++) {
        if (excluded(x, y)) continue;
        all++;
        if (screen.at(Math.floor(x * scale), Math.floor(y * scale)).reduce((sum, level) => sum + level, 0) > Number(litLevelSum)) lit++;
      }
    }
    return all === 0 ? 0 : round((100 * lit) / all);
  };
  const composed = (name, screenFile = `${name}-screen.png`) => {
    const frame = read(`${name}.json`), expected = decode(`${name}-expected.png`), screen = decode(screenFile), scale = frame.devicePixelRatio;
    const excluded = (x, y) => frame.excluded.some((e) => x >= Math.floor(e.x) && x < Math.ceil(e.x + e.width) && y >= Math.floor(e.y) && y < Math.ceil(e.y + e.height));
    let compared = 0, off = 0;
    for (let y = 0; y < expected.height; y++) {
      for (let x = 0; x < expected.width; x++) {
        const pageX = frame.world.x + x, pageY = frame.world.y + y;
        if (excluded(pageX, pageY)) continue;
        const want = expected.at(x, y), got = screen.at(Math.floor(pageX * scale), Math.floor(pageY * scale));
        compared++;
        if (want.some((level, c) => Math.abs(level - got[c]) > Number(tolerance))) off++;
      }
    }
    const sameBox = (layer) => ["x", "y", "width", "height"].every((key) => layer[key] === frame.world[key]) && layer.backing.join() === frame.world.backing.join();
    return {
      ticking: frame.ticking, drew: frame.drew, devicePixelRatio: scale, screen: [screen.width, screen.height], world: frame.world, layers: frame.layers.length,
      layersShareWorldBox: frame.layers.every(sameBox) && frame.world.backing.join() === [frame.world.width, frame.world.height].join(),
      compared, offShare: round((100 * off) / compared), centreLitShare: litShare(screen, frame.centre, scale, excluded),
    };
  };
  const live = (name) => { const state = read(`${name}.json`); return { ...state, centreLitShare: litShare(decode(`${name}.png`), state.centre, 1) }; };
  const observed = {
    resized: composed("present-resized"),
    scaled: composed("present-scaled"),
    paused: composed("present-paused"),
    held: composed("present-paused", "present-paused-held-screen.png"),
    resumed: read("present-resumed.json"),
    lost: live("present-context-lost"),
    restoredLive: live("present-context-restored-live"),
    restored: composed("present-context-restored"),
    clicks: text("tile-clicks.jsonl").split("\n").filter(Boolean).map((line) => JSON.parse(line)),
    lostLogs: text("present-console.log").split("\n").filter((line) => line.includes(lostLog)).length,
  };
  const [width, height] = resizedViewport.split(" ").map(Number);
  const linedUp = (frame) => frame.ticking === false && frame.layersShareWorldBox && frame.offShare <= Number(maxOff) && frame.centreLitShare >= Number(drawnMin);
  const checks = {
    // The canvas fills the space beside the side panel and above the credit strip, so its backing matches its own box.
    resizedLayersLineUp: linedUp(observed.resized) && observed.resized.screen.join() === [width, height].join() && observed.resized.world.backing.join() === [observed.resized.world.width, observed.resized.world.height].join() && observed.resized.devicePixelRatio === 1,
    scaledLayersLineUp: linedUp(observed.scaled) && observed.scaled.devicePixelRatio === Number(deviceScale) && observed.scaled.screen.join() === [width * deviceScale, height * deviceScale].join(),
    clicksAfterResizeOrderTheirTiles: observed.clicks.length === 2 && observed.clicks.every(({ tile, ordered }) => ordered?.x === tile.x && ordered?.y === tile.y),
    pausedFrameStaysDrawn: linedUp(observed.paused) && linedUp(observed.held) && observed.resumed === true,
    contextLossBlanksTheScene: observed.lost.lost === true && observed.lost.contexts === 1 && observed.lost.centreLitShare <= Number(lostMax),
    restoredSceneDraws: observed.restoredLive.lost === false && observed.restoredLive.centreLitShare >= Number(drawnMin) && linedUp(observed.restored),
    contextLossLoggedOnce: observed.lostLogs === 1,
    noPresentPageErrors: read("present-page-errors.json").length === 0,
  };
  return { observed, checks };
}
