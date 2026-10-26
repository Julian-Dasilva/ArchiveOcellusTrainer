import type { TrainerInstance } from "osrs-sdk";
import type { WorldTick } from "../brands";
import { worldTick } from "../brands";

export type Pause = Readonly<{ at: WorldTick; ms: number }>;

export type ClockState =
  | Readonly<{ kind: "set-up" }>
  | Readonly<{ kind: "running" }>
  | Readonly<{ kind: "paused"; at: WorldTick; since: number }>;

const RUNNING: ClockState = { kind: "running" };

export class RunClock {
  private current: ClockState = { kind: "set-up" };
  private readonly ended: Pause[] = [];

  constructor(private readonly trainer: TrainerInstance, private readonly now: () => number = () => performance.now()) {
    trainer.subscribe(() => this.follow());
  }

  state(): ClockState {
    return this.current;
  }

  pauses(): readonly Pause[] {
    const open = this.current.kind === "paused" ? [{ at: this.current.at, ms: this.now() - this.current.since }] : [];
    return [...this.ended, ...open];
  }

  start(): void {
    if (this.current.kind === "set-up") this.trainer.start();
  }

  pause(): void {
    if (this.current.kind === "running") this.trainer.stop();
  }

  resume(): void {
    if (this.current.kind === "paused") this.trainer.start();
  }

  subscribe(listener: () => void): () => void {
    return this.trainer.subscribe(listener);
  }

  private follow(): void {
    const { isPaused, globalTickCounter } = this.trainer.world;
    switch (this.current.kind) {
      case "set-up":
        if (!isPaused) this.current = RUNNING;
        return;
      case "running":
        if (isPaused) this.current = { kind: "paused", at: worldTick(globalTickCounter), since: this.now() };
        return;
      case "paused":
        if (isPaused) return;
        this.ended.push({ at: this.current.at, ms: this.now() - this.current.since });
        this.current = RUNNING;
        return;
      default: {
        const unhandled: never = this.current;
        return unhandled;
      }
    }
  }
}
