import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CacheRender, ControlPanelController, Settings, SoundCache, Trainer, TrainerInstance, Viewport } from "osrs-sdk";
import type { Player, Region, SettingsSnapshot, TrainerLoadingState } from "osrs-sdk";
import { DefaultSidebar, GameOverlay, RuneScapeButton, TrainerApp, useSettingsSnapshot } from "osrs-sdk-react";
import { dress } from "./content/ocellus/js/OcellusLoadout";
import { resolveDrill } from "./content/ocellus/js/OcellusTimings";
import { seed as brandSeed } from "./content/ocellus/js/P4Types";
import { installBossBar } from "./content/ocellus/fight/bossBar";
import type { ChatLine, Fight, FightOptions, StartPhase } from "./content/ocellus/fight/Fight";
import { formatTicks } from "./content/ocellus/fight/Fight";
import { FightRegion, START_NPC } from "./content/ocellus/fight/FightRegion";
import { fromSdk } from "./content/ocellus/fight/geometry";
import { warmLaterPhases } from "./content/ocellus/fight/warmup";
import { keepHoverTextOnCanvas } from "./hoverText";

keepHoverTextOnCanvas();

// A few of Ocellus's animations reference sounds that cache 2746 does not ship; the SDK's preload rejects for each.
window.addEventListener("unhandledrejection", (event) => {
  if (/Sound effect \d+ is not present/.test(String(event.reason))) event.preventDefault();
});

export const CREDIT_LINE =
  "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.";

const FOLLOW_URL = "https://x.com/alrodi";

const CREDITS: readonly Readonly<{ who: string; what: string; href: string }>[] = [
  { who: "Julian-Dasilva", what: "ArchiveOcellusTrainer, the phase 4 trainer this grew from", href: "https://github.com/Julian-Dasilva/ArchiveOcellusTrainer" },
  { who: "Julian-Dasilva", what: "play his phase 4 trainer", href: "https://archive-ocellus-trainer.raid-sims.workers.dev" },
  { who: "ShadowStalkerTM", what: "Duo The Fractured Archive, the reference fight", href: "https://www.youtube.com/watch?v=HAgq_qg0OIY" },
  { who: "MRobertEvers", what: "RSProx tick analysis of the fight", href: "https://github.com/MRobertEvers/oldschool-clientc" },
  { who: "OldSchoolSDK", what: "osrs-sdk, the engine", href: "https://github.com/OldSchoolSDK/osrs-sdk" },
  { who: "OSRS Wiki editors", what: "Ocellus", href: "https://oldschool.runescape.wiki/w/Ocellus" },
];

type Setup = "ranged" | "melee";
type Params = FightOptions & Readonly<{ setup: Setup }>;

const PHASES: readonly StartPhase[] = [1, 2, 3, 4];

function readParams(): Params {
  const url = new URL(window.location.href);
  const get = (name: string) => url.searchParams.get(name);
  const phase = Number(get("phase") ?? "1");
  const rawSeed = get("seed");
  const seed = rawSeed !== null && /^\d{1,10}$/.test(rawSeed) ? Number(rawSeed) % 4294967296 : crypto.getRandomValues(new Uint32Array(1))[0];
  const flag = (name: string, fallback: boolean) => {
    const value = get(name);
    return value === null ? fallback : value === "1";
  };
  return {
    seed,
    party: 1,
    startPhase: phase === 2 || phase === 3 || phase === 4 ? phase : 1,
    hazardTiles: flag("tiles", true),
    videoMarkers: flag("markers", false),
    skipMarkers: flag("skip", false),
    soloVine: flag("vine", true),
    invincible: flag("practice", false),
    setup: get("setup") === "melee" ? "melee" : "ranged",
  };
}

/** A setting that applies live, kept in the URL so a reload keeps it too. */
function rememberFlag(name: string, on: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.set(name, on ? "1" : "0");
  window.history.replaceState(window.history.state, "", url.href);
}

function writeParams(params: Params, fresh = true): void {
  const url = new URL(window.location.href);
  url.searchParams.set("phase", String(params.startPhase));
  url.searchParams.delete("party");
  url.searchParams.set("setup", params.setup);
  url.searchParams.set("tiles", params.hazardTiles ? "1" : "0");
  url.searchParams.set("markers", params.videoMarkers ? "1" : "0");
  url.searchParams.set("skip", params.skipMarkers ? "1" : "0");
  url.searchParams.set("vine", params.soloVine ? "1" : "0");
  url.searchParams.set("practice", params.invincible ? "1" : "0");
  if (fresh) url.searchParams.delete("seed");
  else url.searchParams.set("seed", String(params.seed));
  window.location.assign(url.href);
}

const DEFAULTS_KEY = "ocellus-sim:defaults-v1";

/** The SDK starts muted; this simulator is meant to be heard, so sound starts on for a first visit. */
function applyFirstVisitDefaults(): void {
  try {
    if (localStorage.getItem(DEFAULTS_KEY)) return;
    Settings.playsAudio = true;
    Settings.playsAreaAudio = true;
    Settings.persistToStorage();
    localStorage.setItem(DEFAULTS_KEY, "1");
  } catch {
    // Storage blocked: keep the session's settings as they are.
  }
}

// Browsers keep audio suspended until the page is interacted with.
const resumeAudio = () => {
  void SoundCache.context?.resume();
  window.removeEventListener("pointerdown", resumeAudio);
  window.removeEventListener("keydown", resumeAudio);
};
window.addEventListener("pointerdown", resumeAudio);
window.addEventListener("keydown", resumeAudio);

function createTrainer() {
  CacheRender.configure(new URL("osrs-assets/manifest.json", window.location.href).href);
  Settings.readFromStorage();
  applyFirstVisitDefaults();
  const params = readParams();
  const choices = resolveDrill({ seed: brandSeed(params.seed), selection: { setup: params.setup } }).choices;
  const region = new FightRegion(params, (player: Player) => dress(player, choices.setup));
  installBossBar((r: Region) => (r instanceof FightRegion ? r.fight : null));
  const trainer = new TrainerInstance(region, { readyTimer: 5 });
  return { trainer, region, params };
}

/**
 * Ocellus's later bodies are big (each animation is baked as vertex frames: 12 MB for phase 2, 34 MB for phase 3).
 * Fetch them one at a time once the fight has loaded (his first body loads behind the splash), so the transformations
 * do not stall; the hashed files are cached as immutable.
 */
function prefetchLaterPhases(start: StartPhase): void {
  const later = PHASES.filter((phase) => phase > start).map((phase) => START_NPC[phase]);
  const ids = [...new Set(later)].filter((npc) => npc !== START_NPC[start]).map((npc) => `npc-${npc}`);
  void CacheRender.bundle().then(async (bundle) => {
    for (const id of ids) {
      try {
        await bundle.fetchAsset(id);
      } catch {
        // The model loader fetches it again when the phase begins.
      }
    }
  });
}

type Download = Readonly<{ done: number; total: number }>;

/**
 * The SDK's splash counts only its own small files, so it sits at 100% while the cache models download. Count those
 * instead: every effect graphic (each actor model loads them all) and his first body, sized from the manifest.
 */
function useFirstDownload(start: StartPhase, active: boolean): Download | null {
  const [download, setDownload] = useState<Download | null>(null);
  useEffect(() => {
    if (!active) return;
    let observer: PerformanceObserver | null = null;
    let stopped = false;
    performance.setResourceTimingBufferSize(2000);
    void CacheRender.bundle().then((bundle) => {
      if (stopped) return;
      const sizes = new Map<string, number>();
      for (const [id, asset] of Object.entries(bundle.manifest.assets)) {
        if (id.startsWith("spotanim-") || id === `npc-${START_NPC[start]}`) sizes.set(asset.file, asset.bytes ?? 0);
      }
      const total = [...sizes.values()].reduce((sum, bytes) => sum + bytes, 0);
      const arrived = new Set<string>();
      let done = 0;
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const file = entry.name.split("/").pop() ?? "";
          const bytes = sizes.get(file);
          if (bytes === undefined || arrived.has(file)) continue;
          arrived.add(file);
          done += bytes;
        }
        setDownload({ done, total });
      });
      observer.observe({ type: "resource", buffered: true });
      setDownload({ done, total });
    });
    return () => {
      stopped = true;
      observer?.disconnect();
    };
  }, [start, active]);
  return download;
}

function LoadingSplash({ state, download }: { state?: TrainerLoadingState; download: Download | null }) {
  if (state?.status === "ready") return null;
  const failed = state?.status === "error";
  const progress = download && download.total > 0 ? Math.min(1, download.done / download.total) : 0;
  const mb = (bytes: number) => Math.round(bytes / 1e6);
  return (
    <div id="trainer-loading" className="fight-loading">
      <div>{failed ? `Loading failed: ${state?.error?.message ?? "Unknown error"}` : download ? `Loading Ocellus: ${mb(download.done)} / ${mb(download.total)} MB` : "Loading Ocellus"}</div>
      {!failed && (
        <>
          <div className="fight-loading-bar">
            <div style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="fight-loading-note">The game models download once, then your browser keeps them.</div>
        </>
      )}
    </div>
  );
}

function useFight(region: FightRegion): Fight | null {
  const [fight, setFight] = useState<Fight | null>(region.fight);
  useEffect(() => {
    const unsubscribe = region.onFightChange(() => setFight(region.fight));
    // The trainer may have built the region before this effect ran.
    setFight(region.fight);
    const poll = window.setInterval(() => setFight(region.fight), 500);
    return () => {
      unsubscribe();
      window.clearInterval(poll);
    };
  }, [region]);
  return fight;
}

function useFightVersion(fight: Fight | null): number {
  return useSyncExternalStore(
    (listener) => (fight ? fight.subscribe(listener) : () => undefined),
    () => (fight ? fight.snapshotVersion() : 0),
  );
}

function Hud({ fight }: Readonly<{ fight: Fight }>) {
  useFightVersion(fight);
  return (
    <div className="fight-hud">
      <div className="fight-hud-phase">{fight.started ? fight.label() : "Get ready"}</div>
      <div className="fight-hud-timer">{formatTicks(fight.tick)}</div>
      <div className="fight-hud-tick">tick {fight.tick}</div>
    </div>
  );
}

function Chatbox({ fight }: Readonly<{ fight: Fight }>) {
  useFightVersion(fight);
  const lines: readonly ChatLine[] = fight.chat.slice(-8);
  const list = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  });
  return (
    <div className="fight-chat">
      <div className="fight-chat-lines" ref={list}>
        {lines.map((line, i) => (
          <div key={`${line.tick}-${i}-${line.text}`} style={{ color: line.colour }}>
            {line.text}
          </div>
        ))}
      </div>
      <div className="fight-chat-input">
        <span className="fight-chat-name">You</span>: <span className="fight-chat-caret">Press Enter to Chat...</span>
      </div>
    </div>
  );
}

function Result({ fight, params }: Readonly<{ fight: Fight; params: Params }>) {
  useFightVersion(fight);
  const outcome = fight.outcome;
  if (outcome.kind === "running") return null;
  return (
    <div className="fight-result">
      <h2>{outcome.kind === "won" ? "Ocellus defeated" : "Oh dear, you are dead!"}</h2>
      <p>
        {outcome.kind === "won" ? "Challenge complete" : "You fell"} after <b>{formatTicks(outcome.ticks)}</b> ({outcome.ticks} ticks), in {fight.label().toLowerCase()}.
      </p>
      <div className="fight-result-buttons">
        <RuneScapeButton type="button" onClick={() => writeParams({ ...params, invincible: fight.practice, skipMarkers: fight.skipMarkers })}>Try again</RuneScapeButton>
        <RuneScapeButton type="button" onClick={() => writeParams({ ...params, invincible: fight.practice, skipMarkers: fight.skipMarkers }, false)}>Same seed</RuneScapeButton>
      </div>
      <p className="fight-result-follow">
        Updates and new sims: <a href={FOLLOW_URL} target="_blank" rel="noreferrer">@alrodi on X</a>
      </p>
    </div>
  );
}

const TIPS: Readonly<Record<StartPhase, readonly string[]>> = {
  1: [
    "Pray Missiles for the orange fire volleys, Magic for the blue water ones. Prayer is checked when the shot lands.",
    "At each corner 7 cracks grow toward him. Stand on a closing crack to block it: it heals you instead of him. Unblocked, it feeds his yellow meter and heals him.",
    "Be 3+ tiles from his 3x3 when he explodes (28-30).",
    "At 66% and 25% he teleports to the middle: block the diagonal cracks from the marked squares, dodge the blasts. A full meter makes the strike lethal.",
  ],
  2: [
    "Attack The Blade. Purple portals fire across their rows 4 ticks after lighting; stand where the two orange gaps cross (green tiles).",
    "When pools appear, step on the orange floor portal before all twelve fire.",
    "The skip (\"Phase 2 skip tiles\"): wait on the outer pink tile, 6 out diagonally, and click the inner one, 4 out, one tick before each volley. Running through the wave dodges it.",
  ],
  3: [
    "Pray Melee for his two swings, then step out of the shadow slash: 3 wide, straight or diagonal toward you.",
    "When he starts to spin, turn your overhead OFF (or be injured), then Protect from Melee for the saw blades.",
    "He does six attacks between specials. Every other special is the spin, all phase long; in between, Untether and Insolence take turns (Untether first in the first quadrant, Insolence first after). Spin rubble falls over you slowly: one step clears it.",
    "Void bombs drop where you stand and on the same tile of every quadrant, and stay. Stand at the edge when they come or they'll be under you in phase 4.",
    "The void vine holds you until it dies: cut it (solo, your attack switches to it when it roots you). Kill rifts within 30 ticks or they detonate on you. Untether: pray Magic, get under his 3x3 (purple) by the eruption, and step one tile out when it glows brightest. The slam hits anyone not under him; the aftershock a tick later hits anyone still under.",
    "After Obliteration, cross the stones (click a stone or the next quadrant) before the quadrant falls. Right-click a censer to light it.",
  ],
  4: [
    "Inner void + Deflect Melee: range from outside the 5x5. Outer void + Deflect Range: melee inside the 5x5.",
    "Take your orb back after each wind; in the melee phase it forms across from where you stepped in.",
    "Move a tile every time an explosion marks you. A dodge resets your attack: move, attack, move for 2-tick attacks.",
    "Match your prayer to the hybrid tell: purple ring = Magic, spikes = Missiles, black disk = Melee.",
  ],
};

function SoundToggle() {
  const [on, setOn] = useState(Settings.playsAudio && Settings.playsAreaAudio);
  return (
    <label className="fight-check">
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => {
          Settings.playsAudio = event.target.checked;
          Settings.playsAreaAudio = event.target.checked;
          Settings.persistToStorage();
          void SoundCache.context?.resume();
          setOn(event.target.checked);
        }}
      />
      Sound (game audio)
    </label>
  );
}

/**
 * RuneLite's Tile Indicators. The SDK draws all four, but its toggles sit behind "Advanced settings" at the foot of
 * the sidebar; these apply at once, mid-fight.
 */
const TILE_INDICATORS: readonly Readonly<{ label: string; on: (s: SettingsSnapshot) => boolean; set: (on: boolean) => void }>[] = [
  { label: "Destination tile (where you clicked)", on: (s) => s.targetTileEnabled, set: (on) => Settings.set({ targetTileEnabled: on }) },
  { label: "True tile (where the server has you)", on: (s) => s.trueTileEnabled, set: (on) => Settings.set({ trueTileEnabled: on }) },
  { label: "Hovered tile", on: (s) => s.hoveredTileEnabled, set: (on) => Settings.set({ hoveredTileEnabled: on }) },
  { label: "Player and NPC outlines", on: (s) => s.entityIndicatorEnabled, set: (on) => Settings.set({ entityIndicatorEnabled: on }) },
];

function TileIndicators() {
  const settings = useSettingsSnapshot();
  return (
    <div className="fight-indicators">
      <div className="fight-tips-title">Tile indicators</div>
      {TILE_INDICATORS.map(({ label, on, set }) => (
        <label key={label} className="fight-check">
          <input
            type="checkbox"
            checked={on(settings)}
            onChange={(event) => {
              set(event.target.checked);
              Settings.notifyChanged();
            }}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

type TabKey = "combat_key" | "spellbook_key" | "prayer_key" | "inventory_key" | "equipment_key";

/** The side-panel tabs the SDK lets you bind, in the game's tab order, with its defaults. */
const TAB_KEYS: readonly Readonly<{ setting: TabKey; label: string; fallback: string }>[] = [
  { setting: "combat_key", label: "Combat", fallback: "F5" },
  { setting: "inventory_key", label: "Inventory", fallback: "F4" },
  { setting: "equipment_key", label: "Equipment", fallback: "F1" },
  { setting: "prayer_key", label: "Prayer", fallback: "F3" },
  { setting: "spellbook_key", label: "Spellbook", fallback: "F2" },
];
const KEY_CHOICES = ["", ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`), "Escape"];

/** OSRS-style F-key bindings for the side-panel tabs. A key goes to one tab: taking it unbinds the other. */
function TabKeys() {
  const settings = useSettingsSnapshot();
  const bind = (setting: TabKey, key: string) => {
    const patch: Partial<Record<TabKey, string>> = { [setting]: key };
    if (key) for (const other of TAB_KEYS) if (other.setting !== setting && settings[other.setting] === key) patch[other.setting] = "";
    Settings.set(patch);
    Settings.notifyChanged();
  };
  return (
    <div className="fight-indicators">
      <div className="fight-tips-title">Tab keys</div>
      {TAB_KEYS.map(({ setting, label }) => (
        <label key={setting} className="fight-key">
          {label}
          <select value={settings[setting] ?? ""} onChange={(event) => bind(setting, event.target.value)}>
            {KEY_CHOICES.map((key) => (
              <option key={key || "none"} value={key}>
                {key === "" ? "None" : key === "Escape" ? "Esc" : key}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button
        type="button"
        className="fight-keys-reset"
        onClick={() => {
          Settings.set(Object.fromEntries(TAB_KEYS.map(({ setting, fallback }) => [setting, fallback])));
          Settings.notifyChanged();
        }}
      >
        Reset keys
      </button>
    </div>
  );
}

function Sidebar({ params, fight, region }: Readonly<{ params: Params; fight: Fight | null; region: FightRegion }>) {
  const [draft, setDraft] = useState<Params>(params);
  const [credits, setCredits] = useState(false);
  const set = (patch: Partial<Params>) => setDraft((current) => ({ ...current, ...patch }));
  const phaseNow: StartPhase = fight?.label() === "Phase 2" ? 2 : fight?.label() === "Phase 3" ? 3 : fight?.label() === "Phase 4" ? 4 : 1;
  // Restart replays the current fight; if a setting that only applies at load changed, it relaunches with it instead.
  const changedAtLoad = (["startPhase", "setup", "hazardTiles", "videoMarkers", "soloVine"] as const).some((key) => draft[key] !== params[key]);
  useFightVersion(fight);
  return (
    <div className="fight-sidebar">
      <h3 className="fight-title">Ocellus</h3>
      <div className="fight-subtitle">The Fractured Archive · full fight</div>
      <label>
        Start at
        <select value={draft.startPhase} onChange={(event) => set({ startPhase: (PHASES.find((p) => String(p) === event.target.value) ?? 1) })}>
          <option value={1}>Phase 1 · Corners</option>
          <option value={2}>Phase 2 · The Blade</option>
          <option value={3}>Phase 3 · Quadrants</option>
          <option value={4}>Phase 4 · Last quadrant</option>
        </select>
      </label>
      <label>
        Setup
        <select value={draft.setup} onChange={(event) => set({ setup: event.target.value === "melee" ? "melee" : "ranged" })}>
          <option value="ranged">Ranged (Twisted bow, Masori)</option>
          <option value="melee">Melee (Scythe, Inquisitor's)</option>
        </select>
      </label>
      <label className="fight-check">
        <input type="checkbox" checked={draft.hazardTiles} onChange={(event) => set({ hazardTiles: event.target.checked })} />
        Highlight danger tiles
      </label>
      <label className="fight-check">
        <input type="checkbox" checked={draft.videoMarkers} onChange={(event) => set({ videoMarkers: event.target.checked })} />
        Community tile markers
      </label>
      <label className="fight-check">
        <input
          type="checkbox"
          checked={draft.skipMarkers}
          onChange={(event) => {
            const on = event.target.checked;
            set({ skipMarkers: on });
            region.setSkipMarkers(on);
            rememberFlag("skip", on);
          }}
        />
        Phase 2 skip tiles
      </label>
      <label className="fight-check">
        <input type="checkbox" checked={draft.soloVine} onChange={(event) => set({ soloVine: event.target.checked })} />
        Solo: attack your own vine
      </label>
      <label className="fight-check">
        <input
          type="checkbox"
          checked={draft.invincible}
          onChange={(event) => {
            const on = event.target.checked;
            set({ invincible: on });
            region.setPractice(on);
            rememberFlag("practice", on);
          }}
        />
        Practice (can't die, prayer stays up)
      </label>
      <SoundToggle />
      <RuneScapeButton type="button" style={{ width: "100%" }} onClick={() => writeParams(draft)}>Start fight</RuneScapeButton>
      <RuneScapeButton type="button" style={{ width: "100%" }} onClick={() => (changedAtLoad ? writeParams(draft, false) : Trainer.reset())}>Restart</RuneScapeButton>
      <hr />
      <TileIndicators />
      <hr />
      <TabKeys />
      <hr />
      <div className="fight-tips">
        <div className="fight-tips-title">{`Phase ${phaseNow}`}</div>
        <ul>{TIPS[phaseNow].map((tip) => <li key={tip}>{tip}</li>)}</ul>
      </div>
      <hr />
      <RuneScapeButton type="button" style={{ width: "100%" }} onClick={() => ControlPanelController.controller.setActiveControl("SETTINGS")}>Game settings</RuneScapeButton>
      <RuneScapeButton type="button" style={{ width: "100%" }} onClick={() => window.location.assign(`${window.location.pathname}?mode=p4drill`)}>Phase 4 drills</RuneScapeButton>
      <RuneScapeButton type="button" style={{ width: "100%" }} onClick={() => setCredits((open) => !open)}>Credits & sources</RuneScapeButton>
      <RuneScapeButton type="button" style={{ width: "100%" }} onClick={() => window.open(FOLLOW_URL, "_blank", "noopener")}>Follow @alrodi on X</RuneScapeButton>
      {credits && (
        <ul className="fight-credits">
          <li>Jagex (all game assets)</li>
          {CREDITS.map(({ who, what, href }) => (
            <li key={href}>
              {who}, <a href={href} target="_blank" rel="noreferrer">{what}</a>
            </li>
          ))}
          <li>Seed {params.seed}</li>
        </ul>
      )}
    </div>
  );
}

export function FightApp() {
  const [{ trainer, region, params }] = useState(createTrainer);
  const [loading, setLoading] = useState<TrainerLoadingState>();
  const fight = useFight(region);
  const ready = loading?.status === "ready";
  const download = useFirstDownload(params.startPhase, !ready);

  useEffect(() => {
    if (!ready) return;
    prefetchLaterPhases(params.startPhase);
    const anchor = region.entities[0];
    if (anchor) warmLaterPhases(anchor, params.startPhase);
  }, [ready, params.startPhase, region]);

  useEffect(() => {
    const probe = () => {
      const player = region.fight?.player;
      return {
        tick: region.fight?.tick ?? 0,
        phase: region.fight?.label() ?? "",
        player: player ? fromSdk(player.location) : null,
        hp: player?.currentStats.hitpoint ?? 0,
        boss: region.primaryBoss ? { name: region.primaryBoss.mobName(), hp: region.primaryBoss.currentStats.hitpoint, max: region.primaryBoss.stats.hitpoint } : null,
        outcome: region.fight?.outcome.kind ?? "running",
        chat: region.fight?.chat.slice(-6).map((line) => line.text) ?? [],
        menu: Viewport.viewport?.contextMenu.isActive ?? false,
        menuOptions: Viewport.viewport?.contextMenu.menuOptions.map((option) => option.text.map((block) => block.text).join("")) ?? [],
      };
    };
    // A small console API for testing and for the curious: __ocellus.pray("magic"), __ocellus.walk(3, -5), ...
    const prayerName = { melee: "Protect from Melee", ranged: "Protect from Range", magic: "Protect from Magic" } as const;
    const debug = {
      fight: () => region.fight,
      pray(style: "melee" | "ranged" | "magic" | null) {
        const player = region.fight?.player;
        if (!player) return;
        for (const [key, name] of Object.entries(prayerName)) {
          const prayer = player.prayerController.findPrayerByName(name);
          const wanted = key === style;
          if (prayer && prayer.isActive !== wanted) prayer.toggle(player);
        }
      },
      walk(x: number, z: number) {
        region.fight?.player.walkDirect({ x, z });
      },
      /** A floor click on arena tile (x, z), through the same path a mouse click takes (stones, censers). */
      click(x: number, z: number) {
        region.fight?.player.moveTo(x + 14, 14 - z);
      },
      attack() {
        const fight = region.fight;
        if (fight?.boss) fight.player.setAggro(fight.boss);
      },
      /** Testing helper: game tick length in ms (600 is the game's). */
      speed(ms: number) {
        Settings.tickMs = Math.max(50, Math.min(1200, ms));
      },
      /** Practice helper: set Ocellus's HP to a fraction of his current pool. */
      bossHp(fraction: number) {
        const boss = region.fight?.boss;
        if (boss) boss.currentStats.hitpoint = Math.max(0, Math.round(boss.stats.hitpoint * fraction));
      },
      state() {
        const fight = region.fight;
        if (!fight) return null;
        return { tick: fight.tick, phase: fight.label(), boss: fight.boss && { form: fight.boss.form, tile: fight.boss.tile, hp: fight.boss.currentStats.hitpoint, overhead: fight.boss.overhead, hidden: fight.boss.hidden }, player: fight.playerTile, hp: fight.player.currentStats.hitpoint, meter: fight.meter() };
      },
    };
    Object.assign(window, { __ocellusProbe: probe, __ocellusRegion: region, __ocellus: debug });
  }, [region]);

  return (
    <TrainerApp trainer={trainer} onLoadingStateChange={setLoading}>
      <GameOverlay>
        <LoadingSplash state={loading} download={download} />
        {fight && <Hud fight={fight} />}
        {fight && <Chatbox fight={fight} />}
        {fight && <Result fight={fight} params={params} />}
        <p id="credit_line">{CREDIT_LINE}</p>
      </GameOverlay>
      <DefaultSidebar>
        <Sidebar params={params} fight={fight} region={region} />
      </DefaultSidebar>
    </TrainerApp>
  );
}
