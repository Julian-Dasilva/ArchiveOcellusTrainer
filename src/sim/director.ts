import type { Tick, WorldTick } from "./brands";
import { tick } from "./brands";
import type { Entries, Enter, Host, Mounted, PhaseOf, Phases, RoomControl, RowOf, Run, Section, Setup } from "./encounter";

type Pending<E extends Entries> = Readonly<{ kind: "none" }> | Readonly<{ kind: "enter"; to: Enter<E> }>;

type MountedPhase = Mounted<unknown>;

export class Director<E extends Entries, Ph extends Phases<E, H>, H extends Host<E> = Host<E>> implements Run<E, Ph>, Host<E> {
  readonly seed: Setup<E, Ph, unknown>["seed"];
  readonly room: RoomControl;
  private readonly phases: Ph;
  private readonly start: Setup<E, Ph, unknown>["start"];
  private readonly worldNow: () => WorldTick;
  private past: Section<E, Ph>[] = [];
  private pending: Pending<E> = { kind: "none" };
  private encounterTick = 0;
  private running: Readonly<{ host: H; opened: Opened<E, Ph> }> | null = null;

  constructor(setup: Setup<E, Ph, unknown>, worldNow: () => WorldTick) {
    this.seed = setup.seed;
    this.phases = setup.phases;
    this.start = setup.start;
    this.worldNow = worldNow;
    this.room = { size: setup.room.size, walkable() {} };
  }

  /** Enters the start phase with a fresh history. The region calls it each time it builds its units, so a reset restarts the run. */
  begin(host: H): void {
    this.past = [];
    this.pending = { kind: "none" };
    this.encounterTick = 0;
    this.running = { host, opened: openPhase(this.phases, host, this.start, tick(0), this.worldNow()) };
  }

  get current(): PhaseOf<E> {
    return this.live().opened.phase;
  }

  rules(): MountedPhase["rules"] {
    return this.live().opened.mounted.rules;
  }

  next(to: Enter<E>): void {
    if (this.pending.kind === "enter") throw new Error(`a phase already asked to enter ${this.pending.to.phase} this tick`);
    this.pending = { kind: "enter", to };
  }

  ready(): void {
    this.live().opened.mounted.ready();
  }

  beforeNpcTurns(): void {
    this.live().opened.mounted.openTick();
  }

  postTick(): void {
    const { host, opened } = this.live();
    opened.mounted.finishTick();
    this.encounterTick += 1;
    if (this.pending.kind === "none") return;
    const to = this.pending.to;
    this.pending = { kind: "none" };
    this.past.push(opened.read());
    opened.mounted.leave();
    const entered = openPhase(this.phases, host, to, tick(this.encounterTick), this.worldNow());
    this.running = { host, opened: entered };
    entered.mounted.ready();
  }

  sections(): readonly Section<E, Ph>[] {
    return [...this.past, this.live().opened.read()];
  }

  private live(): Readonly<{ host: H; opened: Opened<E, Ph> }> {
    if (this.running === null) throw new Error("the director has not begun a run");
    return this.running;
  }

  rows<P extends PhaseOf<E>>(phase: P): readonly RowOf<Ph[P]>[] {
    return this.sections().flatMap((section) => (section.phase === phase ? section.rows : []));
  }
}

type Opened<E extends Entries, Ph extends Phases<E>> = Readonly<{
  phase: PhaseOf<E>;
  mounted: MountedPhase;
  read: () => Section<E, Ph>;
}>;

function openPhase<E extends Entries, Ph extends Phases<E, H>, H extends Host<E>>(
  phases: Ph,
  host: H,
  to: Enter<E>,
  enteredAt: Tick,
  enteredAtWorld: WorldTick,
): Opened<E, Ph> {
  const mounted = phases[to.phase].enter(host, to.entry);
  const phase = to.phase;
  return { phase, mounted, read: () => held(phase, enteredAt, enteredAtWorld, mounted.rows()) };
}

/** `Phases` erases every row to unknown. This predicate puts back the list `enter` returned for `phase`. */
function held<E extends Entries, Ph extends Phases<E>>(
  phase: PhaseOf<E>,
  enteredAt: Tick,
  enteredAtWorld: WorldTick,
  rows: readonly unknown[],
): Section<E, Ph> {
  const section = { phase, enteredAt, enteredAtWorld, rows };
  if (!isSection<E, Ph>(section)) throw new RangeError(`phase ${phase} closed a tick without a row list`);
  return section;
}

function isSection<E extends Entries, Ph extends Phases<E>>(
  section: Readonly<{ phase: PhaseOf<E>; enteredAt: Tick; enteredAtWorld: WorldTick; rows: readonly unknown[] }>,
): section is Section<E, Ph> {
  return Array.isArray(section.rows);
}
