import { CardinalDirection, Settings, TrainerInstance, Viewport } from "osrs-sdk";
import type { Region } from "osrs-sdk";
import { seed, tile } from "../../../sim/brands";
import type { Mounted } from "../../../sim/encounter";
import { identity, toRoom } from "../../../sim/frame";
import type { ScriptEvent } from "../../../sim/script";
import type { EncounterPlayerHooks } from "../../../sim/sdk/EncounterPlayer";
import type { EncounterHost } from "../../../sim/sdk/EncounterRegion";
import { EncounterRegion } from "../../../sim/sdk/EncounterRegion";
import { ArenaFloor } from "../fight/arena";
import type { ATile, Body, Quadrant } from "../fight/geometry";
import { GRID, QUADRANTS, at, distanceToBody, fromSdk, quadrantOf, quadrantTiles, toSdk } from "../fight/geometry";
import { FightPlayer } from "../fight/units";
import { dress } from "../js/OcellusLoadout";
import { OCELLUS_P4, defaultLoadout } from "../js/OcellusTimings";
import { P3 } from "../full/data/p3";
import type { P3Watch } from "../full/p3/sdk/phase";
import { p3Phase } from "../full/p3/sdk/phase";
import type { Fall, P3Cause, P3Entry, P3Look, P3Row, P3Types } from "../full/p3/types";

type P3Only = Readonly<{ p3: P3Entry }>;
type Host = EncounterHost<P3Only>;
type Phases = Readonly<{ p3: Readonly<{ name: "p3"; enter: (host: Host, entry: P3Entry) => Mounted<P3Row> }> }>;

export type P3RunOptions = Readonly<{ seed?: number; practice?: boolean; soloVine?: boolean; setup?: "ranged" | "melee" | null; entry?: P3Entry }>;

/** Phase 3 alone, in the full fight's 29-wide arena with his player, for the tests: the engine phase the page mounts. */
class P3Arena extends EncounterRegion<P3Only, Phases> {
  constructor(setup: ConstructorParameters<typeof EncounterRegion<P3Only, Phases>>[0], private readonly worn: (player: FightPlayer) => void) {
    super(setup);
  }

  override get initialFacing(): CardinalDirection {
    return CardinalDirection.NORTH;
  }

  override drawDefaultFloor(): boolean {
    return false;
  }

  protected override createPlayer(start: Readonly<{ x: number; y: number }>, hooks: () => EncounterPlayerHooks): FightPlayer {
    const player = new FightPlayer(this, fromSdk(start), hooks);
    this.worn(player);
    return player;
  }
}

export function startP3(options: P3RunOptions = {}) {
  Settings.readFromStorage();
  const watch: P3Watch = { mounted: null };
  const falls: Fall[] = [];
  let mounted: Mounted<P3Row> | null = null;
  const practice = { on: options.practice ?? true };
  const def = p3Phase<P3Only>({
    settings: { practice: () => practice.on, soloVine: () => options.soloVine ?? true, hazardTiles: () => true },
    watch,
    showFloor: (state) => {
      const floor = new ArenaFloor(region, state);
      region.addEntity(floor);
      return () => {
        region.entities = region.entities.filter((entity) => entity !== floor);
      };
    },
    fallInto: (fall) => {
      falls.push(fall);
      return null;
    },
  });
  const size = { width: GRID, height: GRID };
  const spawn = toSdk(at(5, -3));
  const region: P3Arena = new P3Arena(
    {
      room: {
        size,
        spawn: toRoom(identity(size), tile(spawn.x, spawn.y)),
        drawFloor: () => undefined,
        mount: (_: Region) => ({ dispose() {}, walkable() {} }),
      },
      phases: {
        p3: {
          name: "p3",
          enter: (host, entry) => {
            mounted = def.enter(host, entry);
            return mounted;
          },
        },
      },
      start: { phase: "p3", entry: options.entry ?? { kind: "fresh" } },
      seed: seed(options.seed ?? 1),
    },
    (player) => {
      if (options.setup) dress(player, defaultLoadout(OCELLUS_P4.choices.setup.options[options.setup].value));
    },
  );
  const trainer = new TrainerInstance(region, { force2d: true });
  trainer.mount(document.createElement("canvas"), document.createElement("div"));
  region.world.getReadyTimer = 0;
  Viewport.viewport.resize(800, 600);

  const rows = (): readonly P3Row[] => {
    if (mounted === null) throw new Error("phase 3 never mounted");
    return mounted.rows();
  };
  const now = () => rows().at(-1)?.tick ?? -1;
  const live = () => {
    if (watch.mounted === null) throw new Error("phase 3 is not running");
    return watch.mounted;
  };
  const player = () => {
    const p = region.players[0];
    if (!(p instanceof FightPlayer)) throw new Error("the region has no full-fight player");
    return p;
  };
  const tickOnce = () => region.world.tickWorld();
  const tickTo = (t: number, each: () => void = () => undefined) => {
    for (let guard = 0; now() < t; guard++) {
      if (guard > 2000) throw new Error(`phase 3 stuck at tick ${now()}`);
      tickOnce();
      each();
    }
  };
  const body = (): Body => ({ sw: live().boss.tile, size: 3 });
  const here = (): ATile => player().arenaTile();
  /** Stand beside his 3x3, square on, so every swing reaches you. */
  const stayInReach = () => {
    const boss = live().boss;
    if (boss.hidden || distanceToBody(body(), here()) === 1) return;
    const sw = boss.tile;
    const sides: ATile[] = [at(sw.x - 1, sw.z + 1), at(sw.x + 3, sw.z + 1), at(sw.x + 1, sw.z - 1), at(sw.x + 1, sw.z + 3)];
    const side = sides.find((t) => live().arena.isWalkable(t));
    if (side) player().hop(side);
  };
  /** His HP at a whole-number percentage of the pool. */
  const bossAt = (percent: number) => {
    const boss = live().boss;
    boss.currentStats.hitpoint = Math.ceil((boss.stats.hitpoint * percent) / 100);
  };
  /** Off his quadrant onto another standing one, before it falls. */
  const stepOff = () => {
    const from = quadrantOf(here());
    const next = QUADRANTS.find((q) => q !== from && !live().arena.destroyed.has(q));
    if (!next) throw new Error("no quadrant left to stand on");
    standOn(next);
  };
  const standOn = (q: Quadrant): ATile => {
    const t = quadrantTiles(q).find((tileIn) => live().arena.isWalkable(tileIn));
    if (!t) throw new Error(`no floor in ${q}`);
    player().hop(t);
    return t;
  };
  const events = (): readonly (readonly [number, ScriptEvent<P3Types>])[] => rows().flatMap((row) => row.events.map((event) => [row.tick, event] as const));
  const anims = (from: number, ids: readonly number[]) =>
    events().flatMap(([t, e]) => (e.kind === "boss-changed" && e.change.kind === "animation" && t >= from && ids.includes(e.change.id) ? [[t - from, e.change.id] as const] : []));
  const said = (text: string, from: number) => events().flatMap(([t, e]) => (e.kind === "boss-changed" && e.change.kind === "said" && e.change.text === text ? [t - from] : []));
  const landed = (kinds: readonly P3Cause["kind"][], from = 0) => events().flatMap(([t, e]) => (e.kind === "hit-landed" && kinds.includes(e.cause.kind) && t >= from ? [[t - from, e.cause.kind] as const] : []));
  const looks = <K extends P3Look["kind"]>(kind: K): readonly (readonly [number, Extract<P3Look, { kind: K }>])[] => {
    const isKind = (look: P3Look): look is Extract<P3Look, { kind: K }> => look.kind === kind;
    return events().flatMap(([t, e]) => (e.kind === "shown" && isKind(e.look) ? [[t, e.look] as const] : []));
  };
  const chat = (text: string, from = 0) => looks("chat").flatMap(([t, look]) => (look.text === text ? [t - from] : []));
  return { region, trainer, watch, live, player, rows, now, tickOnce, tickTo, body, here, stayInReach, bossAt, stepOff, standOn, events, anims, said, landed, looks, chat, falls, practice, close: () => trainer.dispose() };
}

/** Phase 3 begins on tick 0 and he lands in his first corner P3.jumpToCornerAfter later: the segment start S. */
export const S = P3.jumpToCornerAfter;
