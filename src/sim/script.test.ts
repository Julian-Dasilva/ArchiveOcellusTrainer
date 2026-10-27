import type { Tick, TickSpan } from "./brands";
import { seed, span, tick, worldTick } from "./brands";
import { noWiki } from "./provenance";
import type { BossChange, Script, ScriptTypes } from "./script";
import { ScriptRun } from "./script";
import type { DamageRange, Selected } from "./sourced";

type Duel = ScriptTypes &
  Readonly<{
    tile: Readonly<{ x: number }>;
    cause: Readonly<{ kind: "jab" | "kick" }>;
    event: Readonly<{ kind: "taunted"; at: Tick }>;
    look: Readonly<{ kind: "flash" }>;
    roll: "taunt";
  }>;

const given = <V>(value: V): Selected<V> => ({
  kind: "selected",
  value,
  evidence: { status: "unverified", basis: "assumption", scale: "test", note: "a test fixture", sources: [noWiki("a test fixture")] },
});
const wait = (n: number): Selected<TickSpan> => given(span(n));
const hits = (min: number, max: number): Selected<DamageRange> => given({ min, max });

function run(script: Partial<Script<Record<string, never>, Duel>>) {
  const applied: BossChange<Duel>[] = [];
  const full: Script<Record<string, never>, Duel> = { begin: () => undefined, each: () => undefined, landed: () => undefined, ...script };
  const engine = new ScriptRun<Record<string, never>, Duel>(
    full,
    {
      seed: seed(7),
      body: { at: () => ({ x: 0 }), hp: () => 100, maxHp: () => 100, defence: () => 10, apply: (change) => applied.push(change), heal: () => undefined },
      player: () => ({ tile: { x: 3 }, hp: 99, prayer: null }),
      healPlayer: () => undefined,
      next: () => undefined,
    },
    tick(0),
  );
  const step = (at: number) => {
    engine.open(tick(at), worldTick(at + 10));
    const requested = engine.requested();
    for (const hit of requested) engine.landed(hit.cause, { requested: 4, applied: 4, beforeHp: 99, afterHp: 95, prayer: null });
    return { requested, row: engine.close(0, []) };
  };
  return { engine, step, applied };
}

describe("a closure-written phase", () => {
  test("a timer's hit is requested and lands in the row of the tick it fires, with its cause", () => {
    const { step } = run({ begin: (m) => m.after(wait(2), (n) => n.hit({ kind: "jab" }, hits(4, 4))) });
    step(0);
    const quiet = step(1);
    const fired = step(2);
    expect([quiet.requested, quiet.row.events]).toEqual([[], []]);
    expect(fired.requested).toEqual([{ cause: { kind: "jab" }, damage: { kind: "fixed", amount: 4 } }]);
    expect(fired.row.events.map((event) => [event.kind, event.at])).toEqual([
      ["hit-requested", 2],
      ["hit-landed", 2],
    ]);
    expect([fired.row.tick, fired.row.worldTick]).toEqual([2, 12]);
  });

  test("a new segment drops the segment's timers, and a blow under way still lands", () => {
    const fired: string[] = [];
    const { step } = run({
      begin: (m) => {
        m.after(wait(2), () => fired.push("next move"));
        m.afterPhase(wait(2), () => fired.push("blow under way"));
        m.afterAlways(wait(2), () => fired.push("always"));
        m.after(wait(1), (n) => n.endSegment());
      },
    });
    [0, 1, 2].forEach(step);
    expect(fired).toEqual(["blow under way", "always"]);
  });

  test("a roll is keyed on its stream and tick, so another stream's draw does not shift it", () => {
    const alone: number[] = [];
    const crowded: number[] = [];
    run({ begin: (m) => alone.push(m.roll("jab", hits(1, 1000))) }).step(5);
    run({
      begin: (m) => {
        m.roll("kick", hits(1, 1000));
        m.pick("taunt", ["a", "b"]);
        crowded.push(m.roll("jab", hits(1, 1000)));
      },
    }).step(5);
    const later: number[] = [];
    run({ begin: (m) => later.push(m.roll("jab", hits(1, 1000))) }).step(6);
    expect(crowded).toEqual(alone);
    expect(later).not.toEqual(alone);
  });

  test("every call to the boss is logged in the row, in order, before the body applies it", () => {
    const { step, applied } = run({
      begin: (m) => {
        m.boss.play(given(14842));
        m.boss.jump({ x: 5 }, wait(2));
        m.boss.say("Untether...", wait(3));
      },
    });
    const { row } = step(0);
    const changes = [{ kind: "animation", id: 14842 }, { kind: "jumped", to: { x: 5 }, over: 2 }, { kind: "said", text: "Untether...", lasts: 3 }];
    expect(row.events).toEqual(changes.map((change) => ({ kind: "boss-changed", at: 0, change })));
    expect(applied).toEqual(changes);
  });
});
