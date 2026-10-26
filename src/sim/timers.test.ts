import { span, tick } from "./brands";
import { Timers } from "./timers";

describe("phase timers", () => {
  test("due timers run in the order they were set, and a cancelled one does not run", () => {
    const ran: string[] = [];
    const timers = new Timers<string>();
    const run = (name: string) => (marker: string) => {
      ran.push(`${marker}:${name}`);
    };
    timers.add(tick(0), span(2), "phase", run("a"));
    const cancelled = timers.add(tick(0), span(2), "phase", run("b"));
    timers.add(tick(0), span(1), "phase", run("c"));
    timers.add(tick(0), span(2), "phase", run("d"));
    timers.cancel(cancelled);

    expect(timers.take(tick(0))).toEqual([]);
    for (const fire of timers.take(tick(1))) fire("t");
    expect(ran).toEqual(["t:c"]);
    for (const fire of timers.take(tick(2))) fire("t");
    expect(ran).toEqual(["t:c", "t:a", "t:d"]);
  });

  test("a segment scope drops on a new segment, and a phase scope drops when the phase leaves", () => {
    const segment = new Timers<string>();
    const ran: string[] = [];
    const run = (name: string) => () => {
      ran.push(name);
    };
    segment.add(tick(0), span(1), "segment", run("segment"));
    segment.add(tick(0), span(1), "phase", run("phase"));
    segment.add(tick(0), span(1), "encounter", run("encounter"));
    segment.leaveSegment();
    for (const fire of segment.take(tick(1))) fire("t");
    expect(ran).toEqual(["phase", "encounter"]);

    const phase = new Timers<string>();
    const kept: string[] = [];
    const keep = (name: string) => () => {
      kept.push(name);
    };
    phase.add(tick(0), span(1), "segment", keep("segment"));
    phase.add(tick(0), span(1), "phase", keep("phase"));
    phase.add(tick(0), span(1), "encounter", keep("encounter"));
    phase.leavePhase();
    for (const fire of phase.take(tick(1))) fire("t");
    expect(kept).toEqual(["encounter"]);
  });

  test("a 0-tick wait throws and is not queued", () => {
    const timers = new Timers<string>();
    expect(() => timers.add(tick(1), span(0), "phase", () => undefined)).toThrow(RangeError);
    expect(timers.take(tick(1))).toEqual([]);
  });
});
