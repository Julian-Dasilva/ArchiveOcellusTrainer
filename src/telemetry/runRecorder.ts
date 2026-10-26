const TICK_TARGET_MS = 600;
const LATE_TICK_GRACE_MS = 100;
const LATE_TICK_MS = TICK_TARGET_MS + LATE_TICK_GRACE_MS;
const SLOW_FRAME_MS = 50;

class Histogram {
  private readonly counts: Uint32Array;
  count = 0;
  max = 0;

  constructor(private readonly bucketMs: number, maxMs: number) {
    this.counts = new Uint32Array(Math.ceil(maxMs / bucketMs) + 1);
  }

  add(ms: number): void {
    this.counts[Math.min(this.counts.length - 1, Math.floor(ms / this.bucketMs))]++;
    this.count++;
    if (ms > this.max) this.max = ms;
  }

  bucketFloorAt(q: number): number {
    const rank = Math.ceil(q * this.count);
    let seen = 0;
    for (let bucket = 0; bucket < this.counts.length; bucket++) {
      seen += this.counts[bucket];
      if (seen >= rank && seen > 0) return bucket * this.bucketMs;
    }
    return 0;
  }
}

export type RunTimings = Readonly<{
  frames: number;
  frameMedianMs: number;
  frameP95Ms: number;
  frameP99Ms: number;
  framesOver50Ms: number;
  runTicks: number;
  tickMedianMs: number;
  tickP95Ms: number;
  tickMaxMs: number;
  lateTicks: number;
}>;

export class RunRecorder {
  private readonly frameGaps = new Histogram(1, 500);
  private readonly tickGaps = new Histogram(5, 5000);
  private lastFrameAt: number | null = null;
  private lastTickAt: number | null = null;
  private slowFrames = 0;
  private lateTicks = 0;

  frame(at: number): void {
    if (this.lastFrameAt !== null) {
      const gap = at - this.lastFrameAt;
      this.frameGaps.add(gap);
      if (gap > SLOW_FRAME_MS) this.slowFrames++;
    }
    this.lastFrameAt = at;
  }

  tick(at: number): void {
    if (this.lastTickAt !== null) {
      const gap = at - this.lastTickAt;
      this.tickGaps.add(gap);
      if (gap > LATE_TICK_MS) this.lateTicks++;
    }
    this.lastTickAt = at;
  }

  excludePause(ms: number): void {
    if (this.lastFrameAt !== null) this.lastFrameAt += ms;
    if (this.lastTickAt !== null) this.lastTickAt += ms;
  }

  timings(): RunTimings {
    const ms = (value: number) => Math.round(value * 10) / 10;
    return {
      frames: this.frameGaps.count,
      frameMedianMs: this.frameGaps.bucketFloorAt(0.5),
      frameP95Ms: this.frameGaps.bucketFloorAt(0.95),
      frameP99Ms: this.frameGaps.bucketFloorAt(0.99),
      framesOver50Ms: this.slowFrames,
      runTicks: this.tickGaps.count,
      tickMedianMs: this.tickGaps.bucketFloorAt(0.5),
      tickP95Ms: this.tickGaps.bucketFloorAt(0.95),
      tickMaxMs: ms(this.tickGaps.max),
      lateTicks: this.lateTicks,
    };
  }
}
