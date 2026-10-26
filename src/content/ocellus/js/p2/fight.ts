import { OCELLUS_P2 } from "../OcellusTimings";
import type { Seed, Tick, Tile } from "../../../../sim/brands";
import type { HitRequest, Logged } from "../../../../sim/sdk/EncounterBinding";
import type { Gaps, P2Beat, P2End, P2Event, P2Hit, P2Phase, PortalIndex, Round, Volley, Wedge } from "../P2Types";
import type { PlayerObservation } from "../P4Types";
import { roll, rollInt } from "../roll";
import { PORTAL_INDICES, armsOf, clockwise, portalTiles, reachTick, turnedClockwise, waveLine, wedgeAt, wedgeTiles } from "./arena";
import type { P2Schedule } from "./schedule";
import { compileP2Schedule } from "./schedule";

export type BladeState = "dormant" | "awake" | "gone";
type Portals = Readonly<{ kind: "idle" }> | Readonly<{ kind: "lit"; gaps: Gaps }> | Readonly<{ kind: "all-lit" }>;
type SafePortal = Readonly<{ kind: "closed" }> | Readonly<{ kind: "open"; tile: Tile; taken: boolean }>;
type RoundState = Readonly<{ round: Round; wedge: Wedge; portals: Portals; lastGaps: Gaps | null; pools: readonly Tile[]; safePortal: SafePortal }>;
/** One row or column of bolts: it is over the tile d out `reachTick(d)` ticks after it fires, and hits at most once. */
type Wave = Readonly<{ line: readonly Tile[]; firedAt: Tick; volley: Volley; spent: boolean }>;

export type P2Fight = Readonly<{
  schedule: P2Schedule;
  firstWedge: Wedge | null;
  round: RoundState | null;
  waves: readonly Wave[];
  blade: BladeState;
  /** Damage The Blade has taken since its last release. */
  stored: number;
  bossHp: number;
}>;

/** `bladeHits` is the damage of the player's hits that land on The Blade this tick, before the boss's turn. */
export type TurnFacts = Readonly<{ at: Tick; player: PlayerObservation; bladeHits: number }>;
export type TurnOutput = Logged<P2Event> | HitRequest<P2Hit>;
export type TurnStep = Readonly<{ fight: P2Fight; outputs: readonly TurnOutput[]; ending: P2End | null }>;

/** `here` is where the player stands for the rest of the boss's turn: their tile at its start, or where the floor portal took them. */
type Turn = Readonly<{ fight: P2Fight; here: Tile; outputs: readonly TurnOutput[]; ending: P2End | null }>;

const { blade, portals, volley, pools } = OCELLUS_P2;
const logged = (event: P2Event): Logged<P2Event> => ({ kind: "event", event });
const same = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;

export function startFight(bossHp: number): P2Fight {
  return { schedule: compileP2Schedule(), firstWedge: null, round: null, waves: [], blade: "dormant", stored: 0, bossHp };
}

function portalIndex(n: number): PortalIndex {
  const index = PORTAL_INDICES.find((candidate) => candidate === n);
  if (index === undefined) throw new RangeError(`no portal ${n} on an arm`);
  return index;
}

/**
 * One gap on each arm, and the two gaps' rows cross on the safe 2x2. A round's first lighting picks each gap at random; later ones move
 * it by up to `gapDrift`. The second arm's gap is held to `gapIndexSum` less the first's, so the 2x2 keeps a tile in the room.
 */
function lightGaps(seed: Seed, at: Tick, previous: Gaps | null): Gaps {
  const drift = portals.gapDrift.value;
  const last = PORTAL_INDICES.length - 1;
  const pick = (draw: number, before: PortalIndex | null, max: number): PortalIndex =>
    portalIndex(before === null ? rollInt(seed, "portalGap", at, { min: 0, max }, draw) : Math.max(0, Math.min(max, before + rollInt(seed, "portalGap", at, { min: -drift, max: drift }, draw))));
  const firstArm = roll(seed, "portalGap", at, 0) < 0.5 ? 0 : 1;
  const gapFirst = pick(1, previous === null ? null : previous[firstArm], last);
  const gapSecond = pick(2, previous === null ? null : previous[1 - firstArm], Math.min(last, portals.gapIndexSum.value - gapFirst));
  return firstArm === 0 ? [gapFirst, gapSecond] : [gapSecond, gapFirst];
}

function shuffled(seed: Seed, at: Tick, tiles: readonly Tile[]): readonly Tile[] {
  const deck = [...tiles];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(roll(seed, "poolTiles", at, i) * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Each portal fires from both its tiles, so every lit portal sends a 2-wide band across the wedge. */
function wavesOf(round: RoundState, at: Tick, kind: Volley, gaps: Gaps | null): readonly Wave[] {
  return armsOf(round.wedge).flatMap((arm, side) =>
    PORTAL_INDICES.filter((index) => gaps === null || gaps[side] !== index).flatMap((index) =>
      portalTiles(arm, index).map((origin): Wave => ({ line: waveLine(arm, origin, round.wedge), firedAt: at, volley: kind, spent: false })),
    ),
  );
}

function litFor(portals: Portals, kind: Volley): Readonly<{ gaps: Gaps | null }> | null {
  switch (portals.kind) {
    case "lit":
      return kind === "lit" ? { gaps: portals.gaps } : null;
    case "all-lit":
      return kind === "all" ? { gaps: null } : null;
    case "idle":
      return null;
    default: {
      const unhandled: never = portals;
      return unhandled;
    }
  }
}

function roundNumber(phase: P2Phase): Round | null {
  switch (phase.stage) {
    case "round":
    case "last-round":
      return phase.round;
    case "arrive":
    case "transition":
      return null;
    default: {
      const unhandled: never = phase;
      return unhandled;
    }
  }
}

const withEvents = (turn: Turn, ...events: readonly P2Event[]): Turn => ({ ...turn, outputs: [...turn.outputs, ...events.map(logged)] });
const withRound = (turn: Turn, round: RoundState | null): Turn => ({ ...turn, fight: { ...turn.fight, round } });

function inRound(turn: Turn, change: (round: RoundState) => Turn): Turn {
  const { round } = turn.fight;
  return round === null ? turn : change(round);
}

function react(seed: Seed, turn: Turn, beat: P2Beat, at: Tick, phase: P2Phase): Turn {
  const { fight, here } = turn;
  switch (beat.kind) {
    case "portals-rise":
      return withEvents(turn, { kind: "portals-rose", at });
    case "blade-wakes":
      return { ...withEvents(turn, { kind: "blade-woke", at }), fight: { ...fight, blade: "awake" } };
    case "round-starts": {
      const round = roundNumber(phase);
      if (round === null) return turn;
      const firstWedge = fight.firstWedge ?? wedgeAt(here);
      const wedge = clockwise(firstWedge, round - 1);
      const state: RoundState = { round, wedge, portals: { kind: "idle" }, lastGaps: null, pools: [], safePortal: { kind: "closed" } };
      return withEvents({ ...turn, fight: { ...fight, firstWedge, round: state } }, { kind: "round-started", at, round, wedge });
    }
    case "portals-light":
      return inRound(turn, (round) => {
        const gaps = lightGaps(seed, at, round.lastGaps);
        return withEvents(withRound(turn, { ...round, portals: { kind: "lit", gaps }, lastGaps: gaps }), { kind: "portals-lit", at, wedge: round.wedge, gaps });
      });
    case "all-portals-light":
      return inRound(turn, (round) => withEvents(withRound(turn, { ...round, portals: { kind: "all-lit" } }), { kind: "portals-lit", at, wedge: round.wedge, gaps: "none" }));
    case "portals-fire":
      return inRound(turn, (round) => {
        const lit = litFor(round.portals, beat.volley);
        if (lit === null) return turn;
        const waves = wavesOf(round, at, beat.volley, lit.gaps);
        const fired: Turn = { ...turn, fight: { ...fight, round: { ...round, portals: { kind: "idle" } }, waves: [...fight.waves, ...waves] } };
        return withEvents(fired, { kind: "portals-fired", at, wedge: round.wedge, volley: beat.volley, waves: waves.length });
      });
    case "pools-form":
      return inRound(turn, (round) => {
        const tiles = shuffled(seed, at, wedgeTiles(round.wedge)).slice(0, pools.count.value);
        return withEvents(withRound(turn, { ...round, pools: tiles }), { kind: "pools-formed", at, tiles });
      });
    case "pools-burst":
      return inRound(turn, (round) => {
        if (!round.pools.some((pool) => same(pool, here))) return turn;
        const hit: HitRequest<P2Hit> = { kind: "hit", damage: { kind: "fixed", amount: rollInt(seed, "poolDamage", at, pools.burst.value.damage, 0) }, cause: { kind: "pool-burst", at, tile: here } };
        return { ...turn, outputs: [...turn.outputs, hit] };
      });
    case "safe-portal-opens":
      return inRound(turn, (round) => {
        const choices = round.pools.length > 0 ? round.pools : wedgeTiles(round.wedge);
        const tile = choices[Math.floor(roll(seed, "safePortalTile", at, 0) * choices.length)];
        return withEvents(withRound(turn, { ...round, safePortal: { kind: "open", tile, taken: false } }), { kind: "safe-portal-opened", at, tile });
      });
    case "safe-portal-takes":
      return inRound(turn, (round) => {
        const portal = round.safePortal;
        if (portal.kind !== "open" || portal.taken || !same(portal.tile, here)) return turn;
        const to = turnedClockwise(here);
        const taken = withRound(turn, { ...round, safePortal: { ...portal, taken: true } });
        return { ...withEvents(taken, { kind: "escaped", at, from: here, to, wedge: clockwise(round.wedge) }), here: to };
      });
    case "blade-discharges":
      return withEvents(turn, { kind: "blade-discharged", at });
    case "blade-releases": {
      const released = Math.min(Math.floor((fight.stored * blade.releasedPercent.value) / 100), Math.max(0, fight.bossHp - 1));
      const bossHp = fight.bossHp - released;
      return withEvents({ ...turn, fight: { ...fight, stored: 0, bossHp } }, { kind: "blade-released", at, stored: fight.stored, released, bossHp });
    }
    case "round-ends":
      return inRound(turn, (round) => withEvents(withRound(turn, null), { kind: "round-ended", at, round: round.round }));
    case "sword-repairs":
      return withEvents(turn, { kind: "sword-repaired", at });
    case "enough":
      return { ...withEvents(turn, { kind: "enough", at }), fight: { ...fight, blade: "gone" } };
    case "sword-falls":
      return withEvents(turn, { kind: "sword-fell", at });
    case "phase-ends": {
      const reason: P2End = { kind: "phase-cleared", bossHp: fight.bossHp };
      return { ...withEvents(turn, { kind: "run-ended", at, reason }), ending: reason };
    }
    default: {
      const unhandled: never = beat;
      return unhandled;
    }
  }
}

/** A wave hits a player who starts the tick on the tile it is over, once: one who runs through it, from a tile it has yet to reach to one it has passed, is missed. */
function judgeWaves(seed: Seed, turn: Turn, at: Tick): Turn {
  const { fight, here } = turn;
  const speed = volley.cyclesPerTile.value;
  const hits: TurnOutput[] = [];
  const judged = fight.waves.map((wave, draw): Wave => {
    const d = wave.line.findIndex((tile) => same(tile, here)) + 1;
    if (wave.spent || d === 0 || wave.firedAt + reachTick(d, speed[wave.volley]) !== at) return wave;
    hits.push({ kind: "hit", damage: { kind: "fixed", amount: rollInt(seed, "volleyDamage", at, volley.damage.value, draw) }, cause: { kind: "volley", at, volley: wave.volley, tile: here } });
    return { ...wave, spent: true };
  });
  const live = judged.filter((wave) => wave.firedAt + reachTick(wave.line.length, speed[wave.volley]) > at);
  return { ...turn, fight: { ...fight, waves: live }, outputs: [...turn.outputs, ...hits] };
}

export function turn(seed: Seed, fight: P2Fight, facts: TurnFacts): TurnStep {
  const { at } = facts;
  const visit = fight.schedule.visitAt(at);
  const { phase, beats } = fight.schedule.at(at);
  const entered: readonly TurnOutput[] = visit.start === at ? [logged({ kind: "stage-entered", at, stage: visit.stage })] : [];
  const stored = fight.blade === "awake" ? fight.stored + facts.bladeHits : fight.stored;
  const start: Turn = { fight: { ...fight, stored }, here: facts.player.tile, outputs: entered, ending: null };
  const reacted = judgeWaves(seed, beats.reduce((done, beat) => react(seed, done, beat, at, phase), start), at);
  return { fight: reacted.fight, outputs: reacted.outputs, ending: reacted.ending };
}
