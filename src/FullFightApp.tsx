import React, { useEffect, useState, useSyncExternalStore } from "react";
import { CacheRender, ControlPanelController, Settings, SoundCache, Trainer, TrainerInstance, Viewport } from "osrs-sdk";
import type { Player, Region, TrainerLoadingState } from "osrs-sdk";
import { GameOverlay, RuneScapeButton, TrainerApp, useSettingsSnapshot } from "osrs-sdk-react";
import { CREDIT_LINE, readSettings } from "./ArchiveOcellusApp";
import { CHANGELOG } from "./content/ocellus/changelog";
import type { CreditLink } from "./menu/credits";
import { CONTRIBUTOR, MAKER_LINKS } from "./menu/credits";
import Sidebar from "./menu/Sidebar";
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
      die(): void;
    }>;
  }
}

const CHAT_LINES_SHOWN = 5;

function xHandle(link: CreditLink): CreditLink {
  return { label: `@${new URL(link.href).pathname.replace(/^\//, "")}`, href: link.href };
}

const UPDATE_LINKS: readonly CreditLink[] = [
  ...MAKER_LINKS.filter((link) => new URL(link.href).host === "x.com").map(xHandle),
  xHandle(CONTRIBUTOR),
];
const [LATEST_RELEASE] = CHANGELOG;

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
  const options: FightOptions = {
    ...params,
    onHandOver: (state) => {
      const practice = region.fight?.practice ?? params.invincible;
      void import("./content/ocellus/js/carry").then(({ handOverToP4 }) => {
        handOverToP4(state, practice);
      });
    },
  };
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
    }).catch(() => {
      // The trainer splash reports a failed manifest. This counter only adds byte progress.
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

function Chatbox({ fight }: Readonly<{ fight: Fight | null }>) {
  useFightVersion(fight);
  const lines: readonly ChatLine[] = fight?.chat.slice(-CHAT_LINES_SHOWN) ?? [];
  return (
    <ol id="game_chat">
      {lines.map((line, index) => (
        <li key={`${line.tick}-${index}`} style={{ color: line.colour }}>{line.text}</li>
      ))}
    </ol>
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
        <RuneScapeButton type="button" onClick={() => writeParams({ ...params, hazardTiles: fight.hazardTiles, invincible: fight.practice, skipMarkers: fight.skipMarkers })}>Try again</RuneScapeButton>
        <RuneScapeButton type="button" onClick={() => writeParams({ ...params, hazardTiles: fight.hazardTiles, invincible: fight.practice, skipMarkers: fight.skipMarkers }, false)}>Same seed</RuneScapeButton>
      </div>
      <p className="fight-result-follow">
        Updates and new sims:{" "}
        {UPDATE_LINKS.map((link, index) => (
          <React.Fragment key={link.href}>
            {index > 0 && " and "}
            <a href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
          </React.Fragment>
        ))}
        {" on X"}
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

function FullFightControls({ params, region }: Readonly<{ params: Params; region: FightRegion }>) {
  const [draft, setDraft] = useState<Params>(params);
  const { playsAudio, playsAreaAudio } = useSettingsSnapshot();
  const set = (patch: Partial<Params>) => setDraft((current) => ({ ...current, ...patch }));
  const changedAtLoad = (["startPhase", "setup", "videoMarkers", "soloVine"] as const).some((key) => draft[key] !== params[key]);
  const setSound = (patch: Readonly<{ playsAudio: boolean } | { playsAreaAudio: boolean }>) => {
    Settings.set(patch);
    void SoundCache.context?.resume();
  };
  return (
    <div id="full_fight_controls">
      <label>
        Start at
        <select id="start_phase" value={draft.startPhase} onChange={(event) => set({ startPhase: START_PHASES.find((phase) => String(phase) === event.target.value) ?? 1 })}>
          <option value={1}>Phase 1 · Corners</option>
          <option value={2}>Phase 2 · The Blade</option>
          <option value={3}>Phase 3 · Quadrants</option>
        </select>
      </label>
      <label>
        Setup
        <select id="setup" value={draft.setup} onChange={(event) => set({ setup: event.target.value === "melee" ? "melee" : "ranged" })}>
          <option value="ranged">Ranged (Twisted bow, Masori)</option>
          <option value="melee">Melee (Scythe, Inquisitor's)</option>
        </select>
      </label>
      <label>
        Community tile markers
        <input id="video_markers" type="checkbox" checked={draft.videoMarkers} onChange={(event) => set({ videoMarkers: event.target.checked })} />
      </label>
      <label>
        Solo: attack your own vine
        <input id="solo_vine" type="checkbox" checked={draft.soloVine} onChange={(event) => set({ soloVine: event.target.checked })} />
      </label>
      <label>
        Practice (can't die, prayer stays up)
        <input
          id="practice"
          type="checkbox"
          checked={draft.invincible}
          onChange={(event) => {
            const on = event.target.checked;
            set({ invincible: on });
            region.setPractice(on);
            rememberFlag("practice", on);
          }}
        />
      </label>
      <section id="learning_aids">
        <div className="sidebar_title">Learning aids</div>
        <label>
          Highlight danger tiles
          <input
            id="hazard_tiles"
            type="checkbox"
            checked={draft.hazardTiles}
            onChange={(event) => {
              const on = event.target.checked;
              set({ hazardTiles: on });
              region.setHazardTiles(on);
              rememberFlag("tiles", on);
            }}
          />
        </label>
      </section>
      <label>
        Sound effects
        <input id="sound" type="checkbox" checked={playsAudio} onChange={(event) => setSound({ playsAudio: event.target.checked })} />
      </label>
      <label>
        Area sounds
        <input id="area_sound" type="checkbox" checked={playsAreaAudio} onChange={(event) => setSound({ playsAreaAudio: event.target.checked })} />
      </label>
      <RuneScapeButton id="keybinds" type="button" style={{ width: "100%" }} onClick={() => ControlPanelController.controller.setActiveControl("SETTINGS")}>Keybinds</RuneScapeButton>
      <RuneScapeButton id="start_fight" type="button" style={{ width: "100%" }} onClick={() => writeParams(draft)}>Start fight</RuneScapeButton>
      <RuneScapeButton id="restart_fight" type="button" style={{ width: "100%" }} onClick={() => (changedAtLoad ? writeParams(draft, false) : Trainer.reset())}>Restart</RuneScapeButton>
    </div>
  );
}

function PhaseTips({ params, fight }: Readonly<{ params: Params; fight: Fight | null }>) {
  useFightVersion(fight);
  const phaseNow = START_PHASES.find((phase) => fight?.label() === `Phase ${phase}`) ?? params.startPhase;
  return (
    <section id="phase_tips">
      <div className="sidebar_title">{`Phase ${phaseNow}`}</div>
      <ul>{TIPS[phaseNow].map((tip) => <li key={tip}>{tip}</li>)}</ul>
    </section>
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
    die: () => region.fight?.lose("fell"),
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
        <div id="hud_corner">
          <Chatbox fight={fight} />
          <footer id="credits">
            <p id="credit_line">{CREDIT_LINE}</p>
            <p id="app_version">v{LATEST_RELEASE.version}</p>
          </footer>
        </div>
        {fight && <Result fight={fight} params={params} />}
      </GameOverlay>
      <Sidebar home="phase-4-drill" after={<PhaseTips params={params} fight={fight} />}>
        <FullFightControls params={params} region={region} />
      </Sidebar>
    </TrainerApp>
  );
}
