import { replacedRun } from "../lib.mjs";

export const captures = () => [
  "setup.json", "setup-gate.json", "setup.png", "setup-bound.json", "setup-started-key.json",
  "pause-held.json", "pause-gate.json", "pause.png", "pause-bound.json", "pause-ticks.json", "pause-resumed-key.json", "pause-key.json", "pause-log.json",
  "setup-pause-page-errors.json", "restart-paused.json",
];

export function judge({ read, env }) {
  const { KEYBIND_NEW_KEY: newKey, PAUSE_REBIND_KEY: rebindKey, PAUSE_HOLD_MS: holdMs } = env;
  const [setUp, setUpGate, bound, startedKey, held, pauseGate, pauseBound, ticks, resumedKey, pauseKey, log, errors, restart] =
    ["setup.json", "setup-gate.json", "setup-bound.json", "setup-started-key.json", "pause-held.json", "pause-gate.json", "pause-bound.json", "pause-ticks.json", "pause-resumed-key.json", "pause-key.json", "pause-log.json", "setup-pause-page-errors.json", "restart-paused.json"].map(read);
  const { draws } = setUp;
  const restarted = replacedRun(restart, env);
  const checks = {
    setUpHoldsTickZero: setUp.snapshot.tick === 0 && setUp.snapshot.ticking === false && setUp.snapshot.fight?.run.kind === "waiting" && setUp.rows === 0 && setUpGate.start && !setUpGate.pause,
    setUpDrawsEveryFrameWithoutGetReady: draws.frames >= 60 && draws.orbFrames >= draws.frames - 2 && draws.getReady === 0,
    keyBoundBeforeStartWithNoTick: bound.snapshot.tick === 0 && bound.rows === 0 && bound.snapshot.panel.keys.inventory === newKey && startedKey.tab === "INVENTORY",
    pauseHoldsTheTick: held.tick === pauseKey.held && held.ticking === false && pauseGate.resume && !pauseGate.pause,
    keyBoundWhilePaused: pauseBound.tick === pauseKey.held && pauseBound.panel.keys.inventory === rebindKey && resumedKey.tab === "INVENTORY",
    resumeContinuesFromTheSameTick: ticks[0] === pauseKey.held && ticks[1] === pauseKey.held + 1 && ticks.every((t, i) => i === 0 || t === ticks[i - 1] + 1),
    resumeShowsPauseAgain: pauseKey.resumed.pause && !pauseKey.resumed.resume,
    pauseIsLogged: log.pauses.length === 1 && log.pauses[0].at === pauseKey.held && log.pauses[0].ms >= Number(holdMs),
    noSetUpOrPausePageErrors: errors.length === 0,
    restartWhilePausedWaitsAtStart: restarted.waitsAtStart,
    restartWhilePausedCarriesNoInput: restarted.carriesNoInput,
  };
  return { observed: { draws, held: pauseKey.held, ticks: ticks.slice(0, 5), pauses: log.pauses, restart }, checks };
}
