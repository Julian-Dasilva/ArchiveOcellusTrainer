import { sameJson } from "../lib.mjs";

export const captures = () => ["focus.json", "focus-audio.json", "focus.png", "focus-console.log", "focus-page-errors.json"];

export function judge({ read, env }) {
  const { FOCUS_DRILL: focusKey, FOCUS_EXPECTED: focusExpected, FOCUS_ENTRY_TICKS: focusEntryTicks, BOSS_POSE_SOUND_SAMPLES: bossPoseSamples } = env;
  const [focus, focusAudio] = ["focus.json", "focus-audio.json"].map(read);
  const observed = {
    focus: { start: focus.rows[0]?.tick ?? null, beats: [...new Set(focus.rows.flatMap((row) => row.beats.map((b) => b.kind)))].sort() },
    focusEntrySounds: focusAudio.filter((s) => s.tick !== null && s.tick >= JSON.parse(focusEntryTicks)[0] && s.tick < JSON.parse(focusEntryTicks)[1]).map((s) => [s.tick, s.phase, s.samples, s.state]),
  };
  const checks = {
    focusApplied: focus.header.choices.focus.key === focusKey && sameJson(observed.focus, focusExpected),
    focusBossHoversAtEntry: observed.focusEntrySounds.some(([, , samples, state]) => samples === JSON.parse(bossPoseSamples).hover && state === "running") &&
      !observed.focusEntrySounds.some(([, , samples]) => samples === JSON.parse(bossPoseSamples).rise),
  };
  return { observed, checks };
}
