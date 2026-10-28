import { fromCentreOf, kindOf, onScheduleWithin, pixels, rowAt, sameJson } from "../lib.mjs";

export const captures = () => [
  "special-before.png", "special-vortex.png", "special-spike-disk.png", "special-semicircle.png", "special-black-disk.png", "special.json", "special-console.log",
  "special-page-errors.json", "special-late.json", "special-audio.json", "special-late-console.log", "special-late-page-errors.json", "special-heal.png", "canvas-centre.json",
];

export function judge({ read, bytes, env }) {
  const { TELL_BOX: tellBox, SPECIAL_EXPECTED: specialExpected, TELL_CENTRE_BOX: tellCentreBox, TRANSITION_SOUND_SAMPLES: transitionSamples,
    LANDING_SOUNDS: landingSounds, LANDING_WINDOWS: landingWindows, STYLE_SOUNDS: styleSounds, STYLE_WINDOWS: styleWindows, SOUND_TOLERANCE_TICKS: soundTolerance,
    SOUL_SPLIT_EXPECTED: soulSplitExpected } = env;
  const { x: centreX, y: centreY } = read("canvas-centre.json");
  const { pixelShare } = pixels(bytes);
  const fromCentre = fromCentreOf(centreX, centreY);
  const onSchedule = onScheduleWithin(soundTolerance);
  const [specialLog, lateLog, transitionAudio] = ["special.json", "special-late.json", "special-audio.json"].map(read);
  const [tellArea, centreArea] = [fromCentre(tellBox), fromCentre(tellCentreBox)];
  const tellShare = (file) => pixelShare(file, (r, g, b) => b >= 150 && r >= 90 && g <= 90 && b - g >= 100, tellArea);
  const centreShares = (file) => ({ white: pixelShare(file, (r, g, b) => r >= 235 && g >= 235 && b >= 235, centreArea), black: pixelShare(file, (r, g, b) => Math.max(r, g, b) <= 40, centreArea) });
  const samplesOf = JSON.parse(transitionSamples);
  const timed = (list) => JSON.parse(list).map(([at, id]) => [at, samplesOf[id]]);
  const heardIn = (windows, expected) => {
    const lengths = new Set(expected.map(([, samples]) => samples));
    return transitionAudio
      .filter((s) => s.rate === 22050 && s.tick !== null && lengths.has(s.samples) && JSON.parse(windows).some(([from, to]) => s.tick + s.phase >= from && s.tick + s.phase < to))
      .map((s) => [Math.round((s.tick + s.phase) * 100) / 100, s.samples]);
  };
  const [landingExpected, styleExpected] = [timed(landingSounds), timed(styleSounds)];
  const prayedAt = (rows) => rows.find((row) => row.inputs.some((input) => input.kind === "prayer-published" && input.prayer === "magic"))?.tick ?? null;
  const hitsOf = (rows) => kindOf(rows, "special-hit").map((e) => [e.at, e.style, e.receipt]);
  const expectedSpecial = JSON.parse(specialExpected);
  const observed = {
    special: {
      prayedAt: prayedAt(specialLog.rows),
      hits: hitsOf(specialLog.rows),
      latePrayedAt: prayedAt(lateLog.rows),
      lateHits: hitsOf(lateLog.rows),
      lateRunEnd: kindOf(lateLog.rows, "run-ended").map((e) => [e.at, e.reason]),
      told: kindOf(lateLog.rows, "special-told").map((e) => [e.at, e.variant, e.style]),
      tellShare: { box: tellArea, ...Object.fromEntries(["special-before.png", "special-vortex.png", "special-spike-disk.png", "special-semicircle.png"].map((file) => [file, tellShare(file)])) },
      centreShares: { box: centreArea, ...Object.fromEntries(["special-vortex.png", "special-spike-disk.png", "special-black-disk.png"].map((file) => [file, centreShares(file)])) },
      landingSounds: heardIn(landingWindows, landingExpected),
      styleSounds: heardIn(styleWindows, styleExpected),
      contexts: [...new Set(transitionAudio.map((s) => s.state))],
    },
    soulSplit: {
      protectedRunReached: rowAt(specialLog.rows, expectedSpecial.protected[0] + 2) !== undefined,
      protectedHeals: kindOf(specialLog.rows, "boss-healed").filter((e) => e.cause.kind === "soul-split").map((e) => [e.at, e.cause, e.receipt]),
      lateHeals: kindOf(lateLog.rows, "boss-healed").filter((e) => e.cause.kind === "soul-split").map((e) => [e.at, e.cause, e.receipt]),
    },
  };
  const { special, soulSplit } = observed;
  const checks = {
    prayerBeforeLandingProtects: special.prayedAt !== null && special.prayedAt < expectedSpecial.protected[0] && sameJson(special.hits, JSON.stringify([expectedSpecial.protected])),
    lateClickTakesFullHit: special.latePrayedAt !== null && special.latePrayedAt > expectedSpecial.late[0] && sameJson(special.lateHits[0], JSON.stringify(expectedSpecial.late)),
    tellsToldOnSchedule: sameJson(special.told, JSON.stringify(expectedSpecial.told)),
    tellsDrawn: special.tellShare["special-before.png"] < 0.3 && ["special-vortex.png", "special-spike-disk.png", "special-semicircle.png"].every((file) => special.tellShare[file] >= 1),
    tellCentresDark: ["special-vortex.png", "special-spike-disk.png", "special-black-disk.png"].every((file) => special.centreShares[file].white < 1),
    landingSoundsOnSchedule: onSchedule(special.landingSounds, landingExpected) && sameJson(special.contexts, JSON.stringify(["running"])),
    styleSoundsOnSchedule: onSchedule(special.styleSounds, styleExpected) && sameJson(special.contexts, JSON.stringify(["running"])),
    soulSplitHealsUnprotected: soulSplit.protectedRunReached && soulSplit.protectedHeals.length === 0 && sameJson(soulSplit.lateHeals, soulSplitExpected),
  };
  return { observed, checks };
}
