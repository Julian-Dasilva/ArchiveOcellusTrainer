import type { Tick, TickSpan } from "./brands";
import { after } from "./brands";

/** A phase timer dies with its phase. A segment timer dies when that phase starts a new segment. An encounter timer survives the change. */
export type Scope = "phase" | "segment" | "encounter";

export class Handle {
  private constructor(
    readonly due: Tick,
    readonly order: number,
    readonly scope: Scope,
  ) {}

  static at(due: Tick, order: number, scope: Scope): Handle {
    return new Handle(due, order, scope);
  }
}

type Entry<M> = Readonly<{ handle: Handle; run: (marker: M) => void }>;

const NONE: readonly never[] = [];

/** Due timers fire in the order they were set, so two closures on one tick replay identically. */
export class Timers<M> {
  private queue: readonly Entry<M>[] = [];
  private set = 0;

  add(now: Tick, wait: TickSpan, scope: Scope, run: (marker: M) => void): Handle {
    if (wait < 1) throw new RangeError(`a timer must wait at least one tick, not ${wait}; run it now instead`);
    const handle = Handle.at(after(now, wait), this.set, scope);
    this.set += 1;
    const at = this.queue.findIndex((entry) => entry.handle.due > handle.due);
    const entry = { handle, run };
    this.queue = at === -1 ? [...this.queue, entry] : [...this.queue.slice(0, at), entry, ...this.queue.slice(at)];
    return handle;
  }

  cancel(handle: Handle): void {
    this.queue = this.queue.filter((entry) => entry.handle !== handle);
  }

  take(now: Tick): readonly ((marker: M) => void)[] {
    let due = 0;
    while (due < this.queue.length && this.queue[due].handle.due <= now) due += 1;
    if (due === 0) return NONE;
    const runs = this.queue.slice(0, due).map((entry) => entry.run);
    this.queue = this.queue.slice(due);
    return runs;
  }

  leaveSegment(): void {
    this.queue = this.queue.filter((entry) => entry.handle.scope !== "segment");
  }

  leavePhase(): void {
    this.queue = this.queue.filter((entry) => entry.handle.scope === "encounter");
  }
}
