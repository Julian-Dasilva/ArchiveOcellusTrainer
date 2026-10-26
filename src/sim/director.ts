import type { Tick, WorldTick } from "./brands";
import { tick } from "./brands";
import type { Entries, Enter, Host, Mounted, PhaseOf, Phases, RoomControl, RowOf, Run, Section, Setup } from "./encounter";

type Pending<E extends Entries> = Readonly<{ kind: "none" }> | Readonly<{ kind: "enter"; to: Enter<E> }>;

type MountedPhase = Mounted<unknown>;

export class Director<E extends Entries, Ph extends Phases<E>> implements Run<E, Ph>, Host<E> {
  readonly seed: Setup<E, Ph>["seed"];
  readonly room: RoomControl;
  private readonly phases: Ph;
  private readonly worldNow: () => WorldTick;
  private readonly past: Section<E, Ph>[] = [];
  private pending: Pending<E> = { kind: "none" };
  private encounterTick = 0;
  private phaseName: PhaseOf<E>;
  private read: () => Section<E, Ph>;
  private mounted: MountedPhase;

  constructor(setup: Setup<E, Ph>, worldNow: () => WorldTick) {
    this.seed = setup.seed;
    this.phases = setup.phases;
    this.worldNow = worldNow;
    this.room = { size: setup.room.size, walkable() {} };
    const opened = openPhase(setup.phases, this, setup.start, tick(0), worldNow());
    this.phaseName = opened.phase;
    this.mounted = opened.mounted;
    this.read = opened.read;
  }

  get current(): PhaseOf<E> {
    return this.phaseName;
  }

  rules(): MountedPhase["rules"] {
    return this.mounted.rules;
  }

  next(to: Enter<E>): void {
    if (this.pending.kind === "enter") throw new Error(`a phase already asked to enter ${this.pending.to.phase} this tick`);
    this.pending = { kind: "enter", to };
  }

  ready(): void {
    this.mounted.ready();
  }

  beforeNpcTurns(): void {
    this.mounted.openTick();
  }

  postTick(): void {
    this.mounted.finishTick();
    this.encounterTick += 1;
    if (this.pending.kind === "none") return;
    const to = this.pending.to;
    this.pending = { kind: "none" };
    this.past.push(this.read());
    this.mounted.leave();
    const opened = openPhase(this.phases, this, to, tick(this.encounterTick), this.worldNow());
    this.phaseName = opened.phase;
    this.mounted = opened.mounted;
    this.read = opened.read;
    this.mounted.ready();
  }

  sections(): readonly Section<E, Ph>[] {
    return [...this.past, this.read()];
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

function openPhase<E extends Entries, Ph extends Phases<E>>(
  phases: Ph,
  host: Host<E>,
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
