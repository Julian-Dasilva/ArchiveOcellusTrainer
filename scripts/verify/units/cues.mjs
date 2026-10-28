import { kindOf, onScheduleWithin, sameJson } from "../lib.mjs";

export const captures = () => [
  "autoplay-policy.js", "cue-contexts-fresh.json", "cue-toggles-fresh.json", "cue-fresh-click.json", "cue-contexts-fresh-clicked.json", "cue-fresh-audio.json",
  "cue-sound-off-saved.json", "cue-fresh-console.log", "cue-fresh-page-errors.json", "cue-recording-from.json", "cue-contexts-loaded.json", "cue-toggles-off.json",
  "cue-toggle-click.json", "cue-contexts-toggled.json", "cue-toggles-on.json", "cue-sound-saved.json", "cue-toggle-audio.json", "cue-toggle-console.log",
  "cue-toggle-page-errors.json", "cue-contexts-reloaded.json", "cue-toggles-reloaded.json", "cue-contexts-clicked.json", "cue-chat-before.json", "cue-chat.json",
  "cues.json", "cue-audio.json", "cue-console.log", "cue-page-errors.json",
];

export function judge({ read, env }) {
  const { CUE_SOUND_SAMPLES: cueSoundSamples, CUE_SOUNDS: cueSounds, CUE_SPAWN_HEARD_UNTIL: spawnHeardUntil, CUE_SOUND_WINDOW: cueSoundWindow, CUE_CHAT: cueChat, SOUND_TOLERANCE_TICKS: soundTolerance } = env;
  const onSchedule = onScheduleWithin(soundTolerance);
  const [cueLog, cueToggleAudio, cueAudio, cueSaved, cueChatBefore, cueChatAfter] =
    ["cues.json", "cue-toggle-audio.json", "cue-audio.json", "cue-sound-saved.json", "cue-chat-before.json", "cue-chat.json"].map(read);
  const [recordingFrom, toggledAt, freshClickedAt, freshAudio, savedOff] =
    ["cue-recording-from.json", "cue-toggle-click.json", "cue-fresh-click.json", "cue-fresh-audio.json", "cue-sound-off-saved.json"].map(read);
  const contexts = Object.fromEntries(["fresh", "fresh-clicked", "loaded", "toggled", "reloaded", "clicked"].map((when) => [when, read(`cue-contexts-${when}.json`)]));
  const toggles = Object.fromEntries(["fresh", "off", "on", "reloaded"].map((when) => [when, read(`cue-toggles-${when}.json`)]));
  const allIn = (states, state) => states.length > 0 && states.every((s) => s === state);
  const timedOnly = (heard) => heard.map(([at, samples]) => [at, samples]);
  const cueSamplesOf = JSON.parse(cueSoundSamples);
  const cueLengths = new Set(Object.values(cueSamplesOf));
  const [cueFrom, cueTo] = JSON.parse(cueSoundWindow);
  const cueHeard = (audio) => audio
    .filter((s) => s.rate === 22050 && s.tick !== null && cueLengths.has(s.samples) && s.tick + s.phase >= cueFrom && s.tick + s.phase < cueTo)
    .map((s) => [Math.round((s.tick + s.phase) * 100) / 100, s.samples, s.state]);
  const cueExpected = JSON.parse(cueSounds).map(([at, id]) => [at, cueSamplesOf[id]]);
  const savedSound = cueSaved?.values ?? {};
  const savedSoundOff = savedOff?.values ?? {};
  const observed = {
    cues: {
      toggles,
      saved: { playsAudio: savedSound.playsAudio ?? null, playsAreaAudio: savedSound.playsAreaAudio ?? null },
      savedOff: { playsAudio: savedSoundOff.playsAudio ?? null, playsAreaAudio: savedSoundOff.playsAreaAudio ?? null },
      freshClickedAt,
      freshHeard: cueHeard(freshAudio),
      contexts,
      recordingFrom,
      toggledAt,
      beforeToggle: cueHeard(cueToggleAudio).filter(([at]) => at < toggledAt),
      afterToggle: cueHeard(cueToggleAudio).filter(([at]) => at >= toggledAt),
      heard: cueHeard(cueAudio),
      chat: [cueChatBefore.data?.text ?? null, cueChatAfter.data?.text ?? null],
      told: kindOf(cueLog.rows, "lifeforce-told").map((e) => e.at),
      spawned: kindOf(cueLog.rows, "orb-spawned").map((e) => [e.at, e.void, e.tile]),
    },
  };
  const { cues } = observed;
  const checks = {
    soundTogglesShownOnWhenFresh: cues.toggles.fresh.sound.visible && cues.toggles.fresh.areaSound.visible && cues.toggles.fresh.sound.checked && cues.toggles.fresh.areaSound.checked,
    defaultSoundPlaysCueAfterFirstClick: cues.freshClickedAt < 5 && allIn(cues.contexts.fresh, "suspended") && allIn(cues.contexts["fresh-clicked"], "running") &&
      onSchedule(timedOnly(cues.freshHeard), cueExpected.filter(([at]) => at < toggledAt)) && cues.freshHeard.every(([, , state]) => state === "running"),
    soundOffChoiceSaved: cues.savedOff.playsAudio === false && cues.savedOff.playsAreaAudio === false,
    soundTogglesShownOff: cues.toggles.off.sound.visible && cues.toggles.off.areaSound.visible && !cues.toggles.off.sound.checked && !cues.toggles.off.areaSound.checked,
    soundTogglesTurnOnCues: recordingFrom < 5 && cues.beforeToggle.length === 0 && cues.toggles.on.sound.checked && cues.toggles.on.areaSound.checked &&
      // That page's player stays on spawn and hears no outer orb chimes, which the cue page's player, a tile in, does.
      onSchedule(timedOnly(cues.afterToggle), cueExpected.filter(([at]) => at >= toggledAt && at < Number(spawnHeardUntil))) && cues.afterToggle.every(([, , state]) => state === "running"),
    soundChoiceSaved: cues.saved.playsAudio === true && cues.saved.playsAreaAudio === true && cues.toggles.reloaded.sound.checked && cues.toggles.reloaded.areaSound.checked,
    audioResumesOnFirstPointerdown: allIn(cues.contexts.loaded, "suspended") && allIn(cues.contexts.toggled, "running") && allIn(cues.contexts.reloaded, "suspended") && allIn(cues.contexts.clicked, "running"),
    cueSoundsOnSchedule: onSchedule(timedOnly(cues.heard), cueExpected) && cues.heard.every(([, , state]) => state === "running"),
    lifeforceChatOnTell: cues.chat[0] === "" && cues.chat[1] === cueChat && sameJson(cues.told, "[11,42]"),
  };
  return { observed, checks };
}
