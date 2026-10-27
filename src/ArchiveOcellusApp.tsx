import React, { Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import { flushSync } from "react-dom";
import { CacheRender, ControlPanelController, SETTINGS_STORAGE_KEY, Settings, SoundCache, TrainerInstance, TrainerLoadingState, Viewport } from "osrs-sdk";
import type { Item, SettingsState } from "osrs-sdk";
import { GameOverlay, RuneScapeButton, TrainerApp, TrainerLoadingSplash, useSettingsSnapshot } from "osrs-sdk-react";
import { OcellusRegion } from "./content/ocellus/js/OcellusRegion";
import type { P3Region } from "./content/ocellus/js/P3Region";
import type { P1Region } from "./content/ocellus/js/P1Region";
import type { P2Region } from "./content/ocellus/js/P2Region";
import type { DrillConfig, P1Config, P2Config, P3Config } from "./content/ocellus/js/OcellusTimings";
import { OCELLUS_P4, defaultLoadout, parseRequest } from "./content/ocellus/js/OcellusTimings";
import type { P3End, P3Log, P3Snapshot } from "./content/ocellus/js/P3Types";
import type { P2End, P2Log, P2Snapshot } from "./content/ocellus/js/P2Types";
import type { P1End, P1Log, P1Snapshot } from "./content/ocellus/js/P1Types";
import type { FightLog, FightSnapshot, RunEnd } from "./content/ocellus/js/P4Types";
import type { Tick } from "./sim/brands";
import type { ClockState, Pause } from "./sim/sdk/RunClock";
import { RunClock } from "./sim/sdk/RunClock";
import { readSavedLoadout } from "./savedLoadouts";
import { keepStorageUsable } from "./browserStorage";
import type { BuildFlags } from "./flags";
import { onlyP4Playable, readBuildFlags } from "./flags";
import { CHANGELOG } from "./content/ocellus/changelog";
import type { ReleaseVersion } from "./releases";
import { releaseDate } from "./releases";
import { keepHoverTextOnCanvas } from "./hoverText";
import { useKeepChatAboveInventory } from "./placeChat";
import { loadWebAnalytics, perfDataAllowed, setPerfDataAllowed, startPerfTelemetry } from "./telemetry/perfTelemetry";
import { reportUnservedAssets } from "./servedAssets";
import { CONTRIBUTOR, CREDIT_LINE, MAKER, MAKER_LINKS } from "./menu/credits";
import type { SidebarSlots } from "./menu/Sidebar";

keepHoverTextOnCanvas();
// Desktop browsers start the SDK's AudioContext suspended until a user gesture, and the SDK never resumes it.
window.addEventListener("pointerdown", () => void SoundCache.context?.resume(), { capture: true });
// Cache 2746 has no synth for three of phase 2's animation frame sounds (12814, 12825, 12832), and the SDK rejects a promise when a frame reaches one.
window.addEventListener("unhandledrejection", (event) => {
  if (event.reason instanceof Error && /^Sound effect \d+ is not present in the runtime pack$/.test(event.reason.message)) event.preventDefault();
});

declare global {
  interface Window {
    __archiveOcellusProbe?: Readonly<{
      snapshot(): VerificationProbeSnapshot;
      log(): RunLog;
      tileCentre(at: Readonly<{ x: number; y: number }>): Readonly<{ x: number; y: number }> | null;
    }>;
  }
}

type RunLog = (FightLog | P3Log | P2Log | P1Log) & Readonly<{ pauses: readonly Pause[] }>;

type VerificationProbeSnapshot = Readonly<{
  ticking: boolean;
  tick: number;
  player: Readonly<{ x: number; y: number }> | null;
  destination: Readonly<{ x: number; y: number }> | null;
  fight: FightSnapshot | P3Snapshot | P2Snapshot | P1Snapshot | null;
  rejected: readonly string[];
  panel: Readonly<{ tab: string | null; keys: Readonly<Record<"inventory" | "spellbook" | "prayer" | "equipment" | "combat", string>> }>;
  menu: readonly string[] | null;
  icons: Readonly<Record<string, Readonly<{ path: string; size: string }>>>;
}>;

function drawnIcons(items: readonly (Item | null | undefined)[]): VerificationProbeSnapshot["icons"] {
  return Object.fromEntries(
    items.flatMap((item) => {
      if (!item || typeof item.cacheItemId !== "number" || !(item.inventorySprite instanceof HTMLImageElement)) return [];
      const { src, naturalWidth, naturalHeight } = item.inventorySprite;
      return [[item.cacheItemId, { path: new URL(src).pathname, size: `${naturalWidth}x${naturalHeight}` }]];
    }),
  );
}

type Drill =
  | Readonly<{ phase: "p4"; region: OcellusRegion; config: DrillConfig }>
  | Readonly<{ phase: "p3"; region: P3Region; config: P3Config }>
  | Readonly<{ phase: "p2"; region: P2Region; config: P2Config }>
  | Readonly<{ phase: "p1"; region: P1Region; config: P1Config }>;


function exposeVerificationProbe(trainer: TrainerInstance, clock: RunClock, region: Drill["region"], rejected: readonly string[]) {
  window.__archiveOcellusProbe = Object.freeze({
    snapshot(): VerificationProbeSnapshot {
      const { player, world } = trainer.getSnapshot();
      const { contextMenu } = Viewport.viewport;
      return {
        ticking: !world.isPaused,
        tick: world.globalTickCounter,
        player: player ? { x: player.location.x, y: player.location.y } : null,
        destination: player?.destinationLocation ? { x: player.destinationLocation.x, y: player.destinationLocation.y } : null,
        fight: region.snapshot(),
        rejected,
        panel: {
          tab: Object.entries(ControlPanelController.controls).find(([, control]) => control === ControlPanelController.controller.selectedControl)?.[0] ?? null,
          keys: { inventory: Settings.inventory_key, spellbook: Settings.spellbook_key, prayer: Settings.prayer_key, equipment: Settings.equipment_key, combat: Settings.combat_key },
        },
        menu: contextMenu.isActive ? contextMenu.menuOptions.map((option) => option.text.map((block) => `${block.text}`).join("")) : null,
        icons: player ? drawnIcons([...player.inventory, ...Object.values(player.equipment)]) : {},
      };
    },
    log: () => ({ ...region.fightLog(), pauses: clock.pauses() }),
    tileCentre: (at) => Viewport.viewport.projectTile(at, trainer.getSnapshot().world),
  });
}

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

type Opened = Readonly<{ trainer: TrainerInstance; clock: RunClock; drill: Drill; flags: BuildFlags; unreadableLoadout: boolean }>;
type Opening = Readonly<{ kind: "open"; opened: Opened }> | Readonly<{ kind: "loading"; opened: Promise<Opened> }>;

/** P1, P2 and P3 load behind a test of the raw build variable, which webpack folds, so a build with a phase off contains none of its modules. */
function openTrainer(): Opening {
  keepStorageUsable();
  CacheRender.configure(new URL("osrs-assets/manifest.json", window.location.href).href);
  void CacheRender.bundle().then(({ manifest }) => reportUnservedAssets(manifest), (error: unknown) => console.error("assets: osrs-assets/manifest.json did not load", error));
  readSettings();
  const flags = readBuildFlags();
  const request = parseRequest(new URL(window.location.href), () => crypto.getRandomValues(new Uint32Array(1))[0], flags);
  const { setup } = request.config.choices;
  const saved = readSavedLoadout(setup.key);
  const loadout = saved.kind === "saved" ? saved.loadout : defaultLoadout(setup.option.value);
  const start = (drill: Drill): Opened => {
    drill.region.invincible = request.invincible;
    const trainer = new TrainerInstance(drill.region);
    const clock = new RunClock(trainer);
    if (process.env.NODE_ENV !== "production") exposeVerificationProbe(trainer, clock, drill.region, request.rejected);
    loadWebAnalytics();
    if (drill.phase === "p4") void startPerfTelemetry(drill.region, clock);
    return { trainer, clock, drill, flags, unreadableLoadout: saved.kind === "unreadable" };
  };
  switch (request.phase) {
    case "p4":
      return { kind: "open", opened: start({ phase: "p4", region: new OcellusRegion(request.config, loadout), config: request.config }) };
    case "p3":
      return {
        kind: "loading",
        opened:
          process.env.ARCHIVE_P3 === "on"
            ? import("./content/ocellus/js/P3Region").then(({ P3Region }) => start({ phase: "p3", region: new P3Region(request.config, loadout), config: request.config }))
            : Promise.reject(new Error("this build has ARCHIVE_P3 off")),
      };
    case "p2":
      return {
        kind: "loading",
        opened:
          process.env.ARCHIVE_P2 === "on"
            ? import("./content/ocellus/js/P2Region").then(({ P2Region }) => start({ phase: "p2", region: new P2Region(request.config, loadout), config: request.config }))
            : Promise.reject(new Error("this build has ARCHIVE_P2 off")),
      };
    case "p1":
      return {
        kind: "loading",
        opened:
          process.env.ARCHIVE_P1 === "on"
            ? import("./content/ocellus/js/P1Region").then(({ P1Region }) => start({ phase: "p1", region: new P1Region(request.config, loadout), config: request.config }))
            : Promise.reject(new Error("this build has ARCHIVE_P1 off")),
      };
    default: {
      const unhandled: never = request;
      return unhandled;
    }
  }
}

const SETUP_KEYS = Object.keys(OCELLUS_P4.choices.setup.options);
const FOCUS_KEYS = Object.keys(OCELLUS_P4.choices.focus.options);
const label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, " ");

const PHASES: readonly Readonly<{ phase: Drill["phase"]; label: string; shown: (flags: BuildFlags) => boolean }>[] = [
  { phase: "p4", label: "Phase 4", shown: () => true },
  { phase: "p3", label: "Phase 3", shown: (flags) => flags.p3 },
  { phase: "p2", label: "Phase 2", shown: (flags) => flags.p2 },
  { phase: "p1", label: "Phase 1", shown: (flags) => flags.p1 },
];

const phaseOf = (value: string): Drill["phase"] => PHASES.find(({ phase }) => phase === value)?.phase ?? "p4";

type RunRequest = Readonly<{ setup: string; seed: string | null; invincible: boolean }> &
  (Readonly<{ phase: "p4"; focus: string }> | Readonly<{ phase: "p3" }> | Readonly<{ phase: "p2"; skipTiles: boolean }> | Readonly<{ phase: "p1" }>);

function startRun(request: RunRequest) {
  const { setup, seed, invincible } = request;
  const url = new URL(window.location.href);
  url.searchParams.set("setup", setup);
  if (request.phase === "p4") url.searchParams.set("focus", request.focus);
  if (request.phase === "p2" && request.skipTiles) url.searchParams.set("markers", "skip-tiles");
  else if (request.phase === "p2") url.searchParams.delete("markers");
  if (seed !== null) url.searchParams.set("seed", seed);
  else url.searchParams.delete("seed");
  if (invincible) url.searchParams.set("invincible", "on");
  else url.searchParams.delete("invincible");
  window.location.assign(url.href);
}

/** The same phase again, keeping the setup, Invincible and the phase's own options; `focus` replaces P4's. */
function rerun(drill: Drill, setup: string, seed: string | null, focus: string | null = null): RunRequest {
  const { invincible } = drill.region;
  switch (drill.phase) {
    case "p4":
      return { phase: "p4", setup, focus: focus ?? drill.config.choices.focus.key, seed, invincible };
    case "p3":
      return { phase: "p3", setup, seed, invincible };
    case "p2":
      return { phase: "p2", setup, seed, invincible, skipTiles: drill.region.skipTilesShown() };
    case "p1":
      return { phase: "p1", setup, seed, invincible };
    default: {
      const unhandled: never = drill;
      return unhandled;
    }
  }
}

function startPhase(phase: Drill["phase"], setup: string, invincible: boolean) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("phase", phase);
  url.searchParams.set("setup", setup);
  if (invincible) url.searchParams.set("invincible", "on");
  window.location.assign(url.href);
}

const [LATEST_RELEASE] = CHANGELOG;
const SEEN_RELEASE_KEY = "archive-ocellus:seen-release";

function seenRelease(): string | null {
  try {
    return localStorage.getItem(SEEN_RELEASE_KEY);
  } catch {
    return null;
  }
}

function rememberSeenRelease(version: ReleaseVersion) {
  try {
    localStorage.setItem(SEEN_RELEASE_KEY, version);
  } catch {}
}

const UnseenDot = () => <span className="unseen_dot" role="img" aria-label="new" />;

type MenuView = "closed" | "settings" | "whats-new";

type LazySidebar = LazyExoticComponent<ComponentType<SidebarSlots>>;

function DrillControls({ drill, flags, clock, Sidebar }: Readonly<{ drill: Drill; flags: BuildFlags; clock: RunClock; Sidebar: LazySidebar | null }>) {
  const { config, region } = drill;
  const [setup, setSetup] = useState<string>(config.choices.setup.key);
  const [typedSeed, setTypedSeed] = useState<string | null>(null);
  const [view, setView] = useState<MenuView>("closed");
  const [unseen, setUnseen] = useState(() => seenRelease() !== LATEST_RELEASE.version);
  const [sendsPerfData, setSendsPerfData] = useState(perfDataAllowed);
  const form = useRef<HTMLFormElement>(null);
  const about = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const whatsNewTitle = useRef<HTMLHeadingElement>(null);
  const { playsAudio, playsAreaAudio } = useSettingsSnapshot();
  const running = useClockState(clock).kind === "running";
  const restart = (focus: string | null) => startRun(rerun(drill, setup, typedSeed?.trim() || null, focus));
  const phases = PHASES.filter(({ shown }) => shown(flags));
  const currentFocus = drill.phase === "p4" ? drill.config.choices.focus.key : null;

  const openWhatsNew = () => {
    rememberSeenRelease(LATEST_RELEASE.version);
    flushSync(() => {
      setView("whats-new");
      setUnseen(false);
    });
    whatsNewTitle.current?.focus();
  };

  const closeWhatsNew = () => {
    setView("closed");
    settingsButton.current?.focus();
  };

  useEffect(() => {
    if (view === "closed") return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (view === "whats-new") closeWhatsNew();
      else setView("closed");
    };
    const closeOutside = (event: Event) => {
      const inside = [form.current, about.current].some((root) => event.target instanceof Node && root?.contains(event.target));
      if (!inside) setView("closed");
    };
    // Capture, because the seed box and the SDK canvas stop their events from bubbling.
    document.addEventListener("keydown", closeOnEscape, true);
    document.addEventListener("pointerdown", closeOutside, true);
    return () => {
      document.removeEventListener("keydown", closeOnEscape, true);
      document.removeEventListener("pointerdown", closeOutside, true);
    };
  }, [view]);

  const phaseField = phases.length > 1 && (
    <label>
      Phase{" "}
      <select id="phase" value={drill.phase} onChange={(event) => startPhase(phaseOf(event.target.value), setup, region.invincible)}>
        {phases.map(({ phase, label: name }) => <option key={phase} value={phase}>{name}</option>)}
      </select>
    </label>
  );
  const setupField = (
    <label>
      Setup{" "}
      <select id="setup" value={setup} onChange={(event) => setSetup(event.target.value)}>
        {SETUP_KEYS.map((key) => <option key={key} value={key}>{label(key)}</option>)}
      </select>
    </label>
  );
  const focusField = currentFocus !== null && (
    <label>
      Focus{" "}
      <select id="focus" value={currentFocus} onChange={(event) => restart(event.target.value)}>
        {FOCUS_KEYS.map((key) => <option key={key} value={key}>{label(key)}</option>)}
      </select>
    </label>
  );
  const skipTilesField = drill.phase === "p2" && (
    <label>
      Skip tiles <input id="skip_tiles" type="checkbox" defaultChecked={drill.config.choices.markers.key === "skip-tiles"} onChange={(event) => drill.region.showSkipTiles(event.target.checked)} />
    </label>
  );
  const seedField = (
    <label>
      Seed <input id="seed" inputMode="numeric" value={typedSeed ?? String(config.seed)} onInput={(event) => setTypedSeed(event.currentTarget.value)} onKeyDown={(event) => event.stopPropagation()} />
    </label>
  );
  const invincibleField = (
    <label>
      Invincible <input id="invincible" type="checkbox" defaultChecked={region.invincible} onChange={(event) => { region.invincible = event.target.checked; }} />
    </label>
  );
  const whatsNewPanel = (
    <section id="whats_new_panel" role="dialog" aria-labelledby="whats_new_title" hidden={view !== "whats-new"}>
      <h2 id="whats_new_title" ref={whatsNewTitle} tabIndex={-1}>What's new</h2>
      {CHANGELOG.map(({ version, notes }) => (
        <article key={version}>
          <h3><time dateTime={releaseDate(version)}>{version}</time></h3>
          <ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </article>
      ))}
      <button id="whats_new_close" type="button" onClick={closeWhatsNew}>Close</button>
    </section>
  );

  if (process.env.ARCHIVE_FULL === "on" && Sidebar !== null) {
    return (
      <Sidebar
        home="full-fight"
        fight={
          <form ref={form} onSubmit={(event) => { event.preventDefault(); restart(currentFocus); }}>
            {phaseField}
            {setupField}
            {focusField}
            {seedField}
            {invincibleField}
            <RuneScapeButton id="restart" type="submit">Restart</RuneScapeButton>
            {running && <RuneScapeButton id="pause" type="button" onClick={() => clock.pause()}>Pause (P)</RuneScapeButton>}
          </form>
        }
        aids={skipTilesField}
        about={
          <div ref={about}>
            <label>
              Performance data
              <small>Sent anonymously</small>
              <input id="perf_data" type="checkbox" checked={sendsPerfData} onChange={(event) => { setPerfDataAllowed(event.target.checked); setSendsPerfData(event.target.checked); }} />
            </label>
            <RuneScapeButton id="whats_new" type="button" aria-expanded={view === "whats-new"} onClick={view === "whats-new" ? closeWhatsNew : openWhatsNew}>What's new{unseen && <UnseenDot />}</RuneScapeButton>
            {whatsNewPanel}
          </div>
        }
        after={null}
      />
    );
  }

  return (
    <form id="drill_controls" ref={form} onSubmit={(event) => { event.preventDefault(); restart(currentFocus); }}>
      <div id="settings_menu" hidden={view !== "settings"}>
        {phaseField}
        {setupField}
        {focusField}
        {skipTilesField}
        {seedField}
        <button id="keybinds" type="button" onClick={() => ControlPanelController.controller.setActiveControl("SETTINGS")}>Keybinds</button>
        <label>
          Sound effects <input id="sound" type="checkbox" checked={playsAudio} onChange={(event) => Settings.set({ playsAudio: event.target.checked })} />
        </label>
        <label>
          Area sounds <input id="area_sound" type="checkbox" checked={playsAreaAudio} onChange={(event) => Settings.set({ playsAreaAudio: event.target.checked })} />
        </label>
        {invincibleField}
        <label>
          Send anonymous performance data <input id="perf_data" type="checkbox" checked={sendsPerfData} onChange={(event) => { setPerfDataAllowed(event.target.checked); setSendsPerfData(event.target.checked); }} />
        </label>
        <button id="whats_new" type="button" onClick={openWhatsNew}>What's new{unseen && <UnseenDot />}</button>
      </div>
      {whatsNewPanel}
      <button id="settings" ref={settingsButton} type="button" aria-expanded={view !== "closed"} aria-controls="settings_menu" onClick={() => setView((shown) => (shown === "closed" ? "settings" : "closed"))}>
        ⚙ Settings{unseen && <UnseenDot />}
      </button>
      <button id="restart" type="submit">Restart</button>
      {running && <button id="pause" type="button" onClick={() => clock.pause()}>Pause (P)</button>}
    </form>
  );
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

function RunGate({ clock, ready, unreadableLoadout }: Readonly<{ clock: RunClock; ready: boolean; unreadableLoadout: string | null }>) {
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
          {unreadableLoadout !== null && <p id="loadout_note">Your saved {unreadableLoadout} loadout could not be read, so this run uses the default loadout.</p>}
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

const SECONDS_TENTHS_PER_TICK = 6;

function gameTime(ticks: number): string {
  const tenths = ticks * SECONDS_TENTHS_PER_TICK;
  const minutes = Math.floor(tenths / 600);
  const seconds = ((tenths % 600) / 10).toFixed(1).padStart(4, "0");
  return `${minutes}:${seconds}`;
}

type DrillOutcome =
  | Readonly<{ phase: "p4"; at: Tick; reason: RunEnd; invincible: boolean }>
  | Readonly<{ phase: "p3"; at: Tick; reason: P3End; invincible: boolean }>
  | Readonly<{ phase: "p2"; at: Tick; reason: P2End; invincible: boolean; bossMaxHp: number }>
  | Readonly<{ phase: "p1"; at: Tick; reason: P1End; invincible: boolean }>;

type InvincibleRegion = Readonly<{ invincible: boolean; fightLog(): Readonly<{ rows: readonly Readonly<{ events: readonly Readonly<{ kind: string }>[] }>[] }> }>;

const invincibleWasOn = (region: InvincibleRegion) => region.invincible || region.fightLog().rows.some((row) => row.events.some((event) => event.kind === "death-prevented"));

function outcome(drill: Drill): DrillOutcome | null {
  switch (drill.phase) {
    case "p4": {
      const run = drill.region.snapshot()?.run;
      if (run?.kind !== "ended") return null;
      return { phase: "p4", at: run.at, reason: run.reason, invincible: invincibleWasOn(drill.region) };
    }
    case "p3": {
      const run = drill.region.snapshot()?.run;
      if (run?.kind !== "ended") return null;
      return { phase: "p3", at: run.at, reason: run.reason, invincible: invincibleWasOn(drill.region) };
    }
    case "p2": {
      const run = drill.region.snapshot()?.run;
      if (run?.kind !== "ended") return null;
      return { phase: "p2", at: run.at, reason: run.reason, invincible: invincibleWasOn(drill.region), bossMaxHp: drill.config.choices.bossMaxHp.option.value };
    }
    case "p1": {
      const run = drill.region.snapshot()?.run;
      if (run?.kind !== "ended") return null;
      return { phase: "p1", at: run.at, reason: run.reason, invincible: invincibleWasOn(drill.region) };
    }
    default: {
      const unhandled: never = drill;
      return unhandled;
    }
  }
}

function RunTime({ phase, at, invincible }: Readonly<{ phase: "P1" | "P2" | "P3" | "P4"; at: Tick; invincible: boolean }>) {
  return (
    <>
      <p id="run_result_time">{phase} time: {at} ticks ({gameTime(at)})</p>
      {invincible && <p id="run_result_note">Invincible was on.</p>}
    </>
  );
}

function RunResultText({ result }: Readonly<{ result: DrillOutcome }>) {
  if (result.phase === "p2") {
    switch (result.reason.kind) {
      case "phase-cleared":
        return (
          <>
            <h2 id="run_result_title">Phase 2 cleared (interim end)</h2>
            <RunTime phase="P2" at={result.at} invincible={result.invincible} />
            <p id="run_result_boss">Ocellus goes into phase 3 at {result.reason.bossHp} / {result.bossMaxHp}.</p>
          </>
        );
      case "death":
        return (
          <>
            <h2 id="run_result_title">You died</h2>
            <p id="run_result_time">on P2 tick {result.at}</p>
          </>
        );
      default: {
        const unhandled: never = result.reason;
        return unhandled;
      }
    }
  }
  if (result.phase === "p1") {
    switch (result.reason.kind) {
      case "phase-cleared":
        return (
          <>
            <h2 id="run_result_title">Phase 1 cleared (interim end)</h2>
            <RunTime phase="P1" at={result.at} invincible={result.invincible} />
          </>
        );
      case "death":
        return (
          <>
            <h2 id="run_result_title">You died</h2>
            <p id="run_result_time">on P1 tick {result.at}</p>
          </>
        );
      default: {
        const unhandled: never = result.reason;
        return unhandled;
      }
    }
  }
  if (result.phase === "p3") {
    switch (result.reason.kind) {
      case "quadrant-cleared":
        return (
          <>
            <h2 id="run_result_title">Quadrant 1 cleared (interim end)</h2>
            <RunTime phase="P3" at={result.at} invincible={result.invincible} />
          </>
        );
      case "death":
        return (
          <>
            <h2 id="run_result_title">You died</h2>
            <p id="run_result_time">on P3 tick {result.at}</p>
          </>
        );
      default: {
        const unhandled: never = result.reason;
        return unhandled;
      }
    }
  }
  const { reason } = result;
  switch (reason) {
    case "kill":
      return (
        <>
          <h2 id="run_result_title">Ocellus defeated</h2>
          <RunTime phase="P4" at={result.at} invincible={result.invincible} />
        </>
      );
    case "death":
      return (
        <>
          <h2 id="run_result_title">You died</h2>
          <p id="run_result_time">on P4 tick {result.at}</p>
        </>
      );
    default: {
      const unhandled: never = reason;
      return unhandled;
    }
  }
}

const RESULT_POLL_MS = 300;

function PausedNote({ pauses }: Readonly<{ pauses: readonly Pause[] }>) {
  if (pauses.length === 0) return null;
  const seconds = (pauses.reduce((total, pause) => total + pause.ms, 0) / 1000).toFixed(1);
  return <p id="run_result_paused">Paused {pauses.length === 1 ? "once" : `${pauses.length} times`}, for {seconds} s in all.</p>;
}

type InterimEnd = Readonly<{ repeat: string; next: Readonly<{ phase: Drill["phase"]; label: string }> | null }>;

/** A hidden drill that reaches its end offers the drill again and, when the build has it, the phase after. */
function interimEnd(result: DrillOutcome, flags: BuildFlags): InterimEnd | null {
  switch (result.phase) {
    case "p4":
      return null;
    case "p3":
      return result.reason.kind === "quadrant-cleared" ? { repeat: "Repeat P3", next: { phase: "p4", label: "Start P4" } } : null;
    case "p2":
      return result.reason.kind === "phase-cleared" ? { repeat: "Repeat P2", next: flags.p3 ? { phase: "p3", label: "Start P3" } : null } : null;
    case "p1":
      return result.reason.kind === "phase-cleared" ? { repeat: "Repeat P1", next: flags.p2 ? { phase: "p2", label: "Start P2" } : null } : null;
    default: {
      const unhandled: never = result;
      return unhandled;
    }
  }
}

function RunResultPanel({ drill, clock, flags }: Readonly<{ drill: Drill; clock: RunClock; flags: BuildFlags }>) {
  const [result, setResult] = useState<DrillOutcome | null>(null);
  useEffect(() => {
    if (result) return;
    const poll = window.setInterval(() => {
      const ended = outcome(drill);
      if (ended) setResult(ended);
    }, RESULT_POLL_MS);
    return () => window.clearInterval(poll);
  }, [drill, result]);

  if (!result) return null;
  const { config, region } = drill;
  const setup = config.choices.setup.key;
  const again = (seed: string | null) => startRun(rerun(drill, setup, seed));
  const interim = interimEnd(result, flags);
  const next = interim?.next ?? null;
  return (
    <section id="run_result" role="dialog" aria-labelledby="run_result_title">
      <RunResultText result={result} />
      <PausedNote pauses={clock.pauses()} />
      <button id="result_restart" type="button" onClick={() => again(null)}>{interim?.repeat ?? "Restart"}</button>
      <button id="result_retry" type="button" onClick={() => again(String(config.seed))}>Retry seed</button>
      {next !== null && <button id={`result_start_${next.phase}`} type="button" onClick={() => startPhase(next.phase, setup, region.invincible)}>{next.label}</button>}
    </section>
  );
}

const CHAT_LINES_SHOWN = 5;
const CHAT_POLL_MS = 300;

function GameChat({ region }: Readonly<{ region: Readonly<{ chat(): readonly string[] }> }>) {
  const [lines, setLines] = useState<readonly string[]>([]);
  useEffect(() => {
    const poll = window.setInterval(() => setLines((shown) => {
      const latest = region.chat();
      return latest.length === shown.length ? shown : latest;
    }), CHAT_POLL_MS);
    return () => window.clearInterval(poll);
  }, [region]);
  useKeepChatAboveInventory(lines.join("\n"));

  return (
    <ol id="game_chat">
      {lines.slice(-CHAT_LINES_SHOWN).map((line, index) => <li key={index}>{line}</li>)}
    </ol>
  );
}

function DrillApp() {
  const [opening, setOpening] = useState(openTrainer);
  useEffect(() => {
    if (opening.kind === "loading") void opening.opened.then((opened) => setOpening({ kind: "open", opened }));
  }, [opening]);
  return opening.kind === "open" ? <TrainerPage {...opening.opened} /> : null;
}

function FullFightShell() {
  const [Page, setPage] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    if (process.env.ARCHIVE_FULL === "on") void import("./content/ocellus/full/page").then(({ FullFightPage }) => setPage(() => FullFightPage));
  }, []);
  return Page ? <Page /> : null;
}

export function ArchiveOcellusApp() {
  // The full fight loads behind a test of the raw build variable, which webpack folds, so a build with it off contains none of its modules.
  if (process.env.ARCHIVE_FULL === "on" && new URL(window.location.href).searchParams.get("mode") === "full") return <FullFightShell />;
  return <DrillApp />;
}

/** The sidebar loads behind a test of the raw build variable, which webpack folds, so a build with ARCHIVE_FULL off contains none of it. */
const loadSidebar = () => (process.env.ARCHIVE_FULL === "on" ? lazy(() => import("./menu/Sidebar")) : null);

function TrainerPage({ trainer, clock, drill, flags, unreadableLoadout }: Opened) {
  const [loading, setLoading] = useState<TrainerLoadingState>();
  const [Sidebar] = useState(loadSidebar);
  const controls = <DrillControls drill={drill} flags={flags} clock={clock} Sidebar={Sidebar} />;

  return (
    <TrainerApp trainer={trainer} autoStart={false} onLoadingStateChange={setLoading}>
      <GameOverlay>
        <TrainerLoadingSplash state={loading} />
        <div id="hud_corner">
          <GameChat region={drill.region} />
          {Sidebar === null && controls}
          <footer id="credits">
            {onlyP4Playable(flags) && <p id="coming_soon">Phases 1 to 3 coming soon.</p>}
            {Sidebar === null && (
              <p id="maker_credit">
                Made by {MAKER}{" "}
                <span id="maker_links">
                  {MAKER_LINKS.map((link, i) => (
                    <React.Fragment key={link.href}>
                      {i > 0 && " · "}
                      <a href={link.href} target="_blank" rel="noopener noreferrer">
                        {link.label}
                      </a>
                    </React.Fragment>
                  ))}
                </span>
                <span id="contributor_credit">
                  With help from{" "}
                  <a href={CONTRIBUTOR.href} target="_blank" rel="noopener noreferrer">
                    {CONTRIBUTOR.label}
                  </a>
                </span>
              </p>
            )}
            {process.env.ARCHIVE_FULL !== "on" && <p id="credit_line">{CREDIT_LINE}</p>}
            {process.env.ARCHIVE_FULL !== "on" && <p id="app_version">v{LATEST_RELEASE.version}</p>}
          </footer>
        </div>
        <RunResultPanel drill={drill} clock={clock} flags={flags} />
        <RunGate clock={clock} ready={loading?.status === "ready"} unreadableLoadout={unreadableLoadout ? label(drill.config.choices.setup.key) : null} />
      </GameOverlay>
      {Sidebar !== null && (
        <Suspense fallback={null}>
          {controls}
        </Suspense>
      )}
    </TrainerApp>
  );
}
