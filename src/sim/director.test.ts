import { seed, tick, worldTick } from "./brands";
import { Director } from "./director";
import type { Host, Mounted, PhaseDef, Room, Rules } from "./encounter";
import { identity, toRoom } from "./frame";
import { tile } from "./brands";

type Boss = Readonly<{
  calm: Readonly<{ kind: "fresh" }>;
  rage: Readonly<{ kind: "carried"; hp: number }>;
}>;

type Row = Readonly<{ tick: number; phase: "calm" | "rage" }>;

const rules: Rules = {
  judge: () => ({ outcome: "passed" }),
  hpFloor: () => 0,
  walk: () => ({ kind: "sdk" }),
  canAttack: () => true,
  lineOfSight: () => "sdk",
};

function room(): Room {
  const size = { width: 20, height: 20 };
  return {
    size,
    drawFloor() {},
    mount() {
      return { dispose() {}, walkable() {} };
    },
    spawn: toRoom(identity(size), tile(10, 10)),
  };
}

function mount(name: "calm" | "rage", log: string[], detail: string): Mounted<Row> {
  const rows: Row[] = [];
  let open = 0;
  return {
    frame: identity({ width: 20, height: 20 }),
    rules,
    ready() {
      log.push(`${name}-ready ${detail}`);
    },
    openTick() {
      open += 1;
    },
    finishTick() {
      rows.push({ tick: open, phase: name });
      log.push(`${name}-finish`);
    },
    rows: () => rows,
    leave() {
      log.push(`${name}-leave`);
    },
  };
}

function phases(log: string[], onRageReady?: (host: Host<Boss>) => void): { readonly calm: PhaseDef<Boss, "calm", Row>; readonly rage: PhaseDef<Boss, "rage", Row> } {
  return {
    calm: {
      name: "calm",
      enter(_host, entry) {
        return mount("calm", log, entry.kind);
      },
    },
    rage: {
      name: "rage",
      enter(host, entry) {
        const mounted = mount("rage", log, String(entry.hp));
        return {
          ...mounted,
          ready() {
            mounted.ready();
            onRageReady?.(host);
          },
        };
      },
    },
  };
}

describe("a director", () => {
  test("a second next in one tick throws, and the first request enters after that tick's row closes", () => {
    const log: string[] = [];
    let world = 4;
    const director = new Director({ room: room(), phases: phases(log), start: { phase: "calm", entry: { kind: "fresh" } }, seed: seed(1) }, () => worldTick(world));
    director.begin(director);
    director.ready();
    director.beforeNpcTurns();
    director.next({ phase: "rage", entry: { kind: "carried", hp: 40 } });
    expect(() => director.next({ phase: "calm", entry: { kind: "fresh" } })).toThrow(Error);
    world = 9;
    director.postTick();

    expect(director.current).toBe("rage");
    expect(log).toEqual(["calm-ready fresh", "calm-finish", "calm-leave", "rage-ready 40"]);
    expect(director.sections()).toEqual([
      { phase: "calm", enteredAt: tick(0), enteredAtWorld: worldTick(4), rows: [{ tick: 1, phase: "calm" }] },
      { phase: "rage", enteredAt: tick(1), enteredAtWorld: worldTick(9), rows: [] },
    ]);
    expect(director.rows("calm")).toEqual([{ tick: 1, phase: "calm" }]);
  });

  test("a next from the new phase's ready waits until the following tick", () => {
    const log: string[] = [];
    const director = new Director(
      {
        room: room(),
        phases: phases(log, (host) => host.next({ phase: "calm", entry: { kind: "fresh" } })),
        start: { phase: "calm", entry: { kind: "fresh" } },
        seed: seed(1),
      },
      () => worldTick(0),
    );
    director.begin(director);
    director.beforeNpcTurns();
    director.next({ phase: "rage", entry: { kind: "carried", hp: 12 } });
    director.postTick();
    expect(director.current).toBe("rage");
    director.beforeNpcTurns();
    director.postTick();
    expect(director.current).toBe("calm");
    expect(director.rows("rage")).toEqual([{ tick: 1, phase: "rage" }]);
    expect(log).toEqual(["calm-finish", "calm-leave", "rage-ready 12", "rage-finish", "rage-leave", "calm-ready fresh"]);
  });
});
