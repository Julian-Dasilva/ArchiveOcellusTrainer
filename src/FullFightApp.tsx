import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CacheRender, ControlPanelController, Settings, SoundCache, Trainer, TrainerInstance, Viewport } from "osrs-sdk";
import type { Player, Region, SettingsSnapshot, TrainerLoadingState } from "osrs-sdk";
import { DefaultSidebar, GameOverlay, RuneScapeButton, TrainerApp, useSettingsSnapshot } from "osrs-sdk-react";
import { CREDIT_LINE, readSettings } from "./ArchiveOcellusApp";
import { dress } from "./content/ocellus/js/OcellusLoadout";
import { OCELLUS_P4, defaultLoadout } from "./content/ocellus/js/OcellusTimings";
import { installBossBar } from "./content/ocellus/fight/bossBar";
import type { ChatLine, Fight, FightOptions, StartPhase } from "./content/ocellus/fight/Fight";
import { START_PHASES, formatTicks } from "./content/ocellus/fight/Fight";
import { FightRegion, START_NPC } from "./content/ocellus/fight/FightRegion";
import type { ATile, Quadrant } from "./content/ocellus/fight/geometry";
import { toSdk } from "./content/ocellus/fight/geometry";
import { warmLaterPhases } from "./content/ocellus/fight/warmup";
import { FULL_FIGHT_CSS } from "./fullFightStyles";

declare global {
  interface Window {
    __fullFightProbe?: Readonly<{
      snapshot(): FullFightSnapshot;
      tileCentre(at: ATile): Readonly<{ x: number; y: number }> | null;
    }>;
  }
}

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
type Params = Omit<FightOptions, "onHandOver"> & Readonly<{ setup: Setup }>;

function readParams(): Params {
  const url = new URL(window.location.href);
  const get = (name: string) => url.searchParams.get(name);
  const startPhase = START_PHASES.find((phase) => String(phase) === get("phase")) ?? 1;
  const rawSeed = get("seed");
  const seed = rawSeed !== null && /^\d{1,10}$/.test(rawSeed) ? Number(rawSeed) % 4294967296 : crypto.getRandomValues(new Uint32Array(1))[0];
  const flag = (name: string, fallback: boolean) => {
    const value = get(name);
    return value === null ? fallback : value === "1";
  };
  return {
    seed,
    party: 1,
    startPhase,
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

function createTrainer() {
  CacheRender.configure(new URL("osrs-assets/manifest.json", window.location.href).href);
  readSettings();
  const params = readParams();
  const setup = OCELLUS_P4.choices.setup.options[params.setup].value;
  const options: FightOptions = { ...params, onHandOver: (state) => console.info("full-fight: hand over", JSON.stringify(state)) };
  const region = new FightRegion(options, (player: Player) => dress(player, defaultLoadout(setup)));
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
  const later = START_PHASES.filter((phase) => phase > start).map((phase) => START_NPC[phase]);
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

function Sidebar({ params, fight, region }: Readonly<{ params: Params; fight: Fight | null; region: FightRegion }>) {
  const [draft, setDraft] = useState<Params>(params);
  const [credits, setCredits] = useState(false);
  const set = (patch: Partial<Params>) => setDraft((current) => ({ ...current, ...patch }));
  const phaseNow = START_PHASES.find((phase) => fight?.label() === `Phase ${phase}`) ?? params.startPhase;
  // Restart replays the current fight; if a setting that only applies at load changed, it relaunches with it instead.
  const changedAtLoad = (["startPhase", "setup", "hazardTiles", "videoMarkers", "soloVine"] as const).some((key) => draft[key] !== params[key]);
  useFightVersion(fight);
  return (
    <div className="fight-sidebar">
      <h3 className="fight-title">Ocellus</h3>
      <div className="fight-subtitle">The Fractured Archive · full fight</div>
      <label>
        Start at
        <select value={draft.startPhase} onChange={(event) => set({ startPhase: START_PHASES.find((phase) => String(phase) === event.target.value) ?? 1 })}>
          <option value={1}>Phase 1 · Corners</option>
          <option value={2}>Phase 2 · The Blade</option>
          <option value={3}>Phase 3 · Quadrants</option>
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
      <div className="fight-tips">
        <div className="fight-tips-title">{`Phase ${phaseNow}`}</div>
        <ul>{TIPS[phaseNow].map((tip) => <li key={tip}>{tip}</li>)}</ul>
      </div>
      <hr />
      <RuneScapeButton type="button" style={{ width: "100%" }} onClick={() => ControlPanelController.controller.setActiveControl("SETTINGS")}>Game settings</RuneScapeButton>
      <RuneScapeButton type="button" style={{ width: "100%" }} onClick={() => window.location.assign(window.location.pathname)}>Phase 4 drill</RuneScapeButton>
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

type FullFightSnapshot = Readonly<{
  tick: number;
  phase: string;
  outcome: Fight["outcome"]["kind"];
  player: ATile | null;
  hp: number;
  boss: Readonly<{ tile: ATile; hp: number; hidden: boolean }> | null;
  fallen: readonly Quadrant[];
  crumbling: readonly Quadrant[];
  chat: readonly string[];
}>;

function exposeProbe(trainer: TrainerInstance, region: FightRegion): void {
  window.__fullFightProbe = Object.freeze({
    snapshot(): FullFightSnapshot {
      const fight = region.fight;
      return {
        tick: fight?.tick ?? 0,
        phase: fight?.label() ?? "",
        outcome: fight?.outcome.kind ?? "running",
        player: fight ? fight.playerTile : null,
        hp: fight?.player.currentStats.hitpoint ?? 0,
        boss: fight?.boss ? { tile: fight.boss.tile, hp: fight.boss.currentStats.hitpoint, hidden: fight.boss.hidden } : null,
        fallen: fight ? [...fight.destroyed] : [],
        crumbling: fight ? fight.floorState().crumbling : [],
        chat: fight?.chat.slice(-6).map((line) => line.text) ?? [],
      };
    },
    tileCentre: (at) => Viewport.viewport.projectTile(toSdk(at), trainer.getSnapshot().world),
  });
}

export function FullFightApp() {
  const [{ trainer, region, params }] = useState(createTrainer);
  const [loading, setLoading] = useState<TrainerLoadingState>();
  const fight = useFight(region);
  const ready = loading?.status === "ready";
  const download = useFirstDownload(params.startPhase, !ready);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = FULL_FIGHT_CSS;
    document.head.append(style);
    if (process.env.NODE_ENV !== "production") exposeProbe(trainer, region);
    return () => style.remove();
  }, [trainer, region]);

  useEffect(() => {
    if (!ready) return;
    const anchor = region.entities[0];
    prefetchLaterPhases(params.startPhase);
    if (anchor) warmLaterPhases(anchor, params.startPhase);
  }, [ready, params.startPhase, region]);

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
