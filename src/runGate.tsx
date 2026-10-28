import React, { useEffect, useSyncExternalStore } from "react";
import { SETTINGS_STORAGE_KEY, Settings } from "osrs-sdk";
import type { SettingsState } from "osrs-sdk";
import { RuneScapeButton } from "osrs-sdk-react";
import type { ClockState, RunClock } from "./sim/sdk/RunClock";

const SOUNDS_START_ON = true;
const THREE_D_VIEW = { use3dView: true, rotated: "north" } as const;

type SoundChoice = Partial<Pick<SettingsState, "playsAudio" | "playsAreaAudio">>;

function savedSoundChoice(): SoundChoice {
  let stored: unknown;
  try {
    stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "null");
  } catch {
    return {};
  }
  const values: unknown = typeof stored === "object" && stored !== null && "values" in stored ? stored.values : null;
  if (typeof values !== "object" || values === null) return {};
  return {
    ...("playsAudio" in values && typeof values.playsAudio === "boolean" && { playsAudio: values.playsAudio }),
    ...("playsAreaAudio" in values && typeof values.playsAreaAudio === "boolean" && { playsAreaAudio: values.playsAreaAudio }),
  };
}

export function readSettings() {
  // The SDK saves its own off defaults on a first load and turns sound off on every mobile load, so the player's choice is read before it loads.
  const saved = savedSoundChoice();
  Settings.readFromStorage();
  Settings.set({ ...THREE_D_VIEW, playsAudio: saved.playsAudio ?? SOUNDS_START_ON, playsAreaAudio: saved.playsAreaAudio ?? SOUNDS_START_ON });
}

const PAUSE_KEY = "p";

const tabKeys = () => [Settings.inventory_key, Settings.spellbook_key, Settings.prayer_key, Settings.equipment_key, Settings.combat_key];
const isTyping = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;

function useClockState(clock: RunClock): ClockState {
  return useSyncExternalStore((changed) => clock.subscribe(changed), () => clock.state());
}

function isPauseKey(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== PAUSE_KEY || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false;
  return !isTyping(event.target) && !tabKeys().some((key) => key.toLowerCase() === PAUSE_KEY);
}

export function RunPauseButton({ clock }: Readonly<{ clock: RunClock }>) {
  const running = useClockState(clock).kind === "running";
  if (!running) return null;
  return <RuneScapeButton id="pause" type="button" onClick={() => clock.pause()}>Pause (P)</RuneScapeButton>;
}

export function RunGate({ clock, ready }: Readonly<{ clock: RunClock; ready: boolean }>) {
  const state = useClockState(clock);
  useEffect(() => {
    const togglePause = (event: KeyboardEvent) => {
      if (!isPauseKey(event)) return;
      if (clock.state().kind === "running") clock.pause();
      else clock.resume();
    };
    document.addEventListener("keydown", togglePause);
    return () => document.removeEventListener("keydown", togglePause);
  }, [clock]);

  switch (state.kind) {
    case "set-up":
      return ready ? (
        <section id="start_panel" role="dialog" aria-labelledby="start_title">
          <h2 id="start_title">Ready?</h2>
          <p>Set your keybinds and settings first. Press P to pause during the run.</p>
          <button id="start" type="button" autoFocus onClick={() => clock.start()}>Start</button>
        </section>
      ) : null;
    case "paused":
      return (
        <section id="paused_panel" role="dialog" aria-labelledby="paused_title">
          <h2 id="paused_title">Paused</h2>
          <p>Change your keybinds or settings, then resume.</p>
          <button id="resume" type="button" autoFocus onClick={() => clock.resume()}>Resume (P)</button>
        </section>
      );
    case "running":
      return null;
    default: {
      const unhandled: never = state;
      return unhandled;
    }
  }
}
