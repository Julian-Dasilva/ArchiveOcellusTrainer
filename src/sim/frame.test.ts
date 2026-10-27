import { tile } from "./brands";
import type { QuarterTurns } from "./frame";
import { toLocal, toRoom, toRoomFootprint, toRoomPoint } from "./frame";

describe("a phase frame", () => {
  test("four clockwise turns round-trip a local tile through literal room tiles", () => {
    const local = tile(2, 1);
    const size = { width: 20, height: 20 };
    const origin = { x: 5, y: 7 };
    const rooms = [tile(7, 8), tile(4, 9), tile(3, 6), tile(6, 5)];
    const turns: readonly QuarterTurns[] = [0, 1, 2, 3];
    for (const turn of turns) {
      const frame = { turns: turn, origin, size };
      const room = toRoom(frame, local);
      expect(room).toEqual(rooms[turn]);
      expect(toLocal(frame, room)).toEqual(local);
    }
  });

  test("a 3x3 anchored on its south-west tile keeps a south-west anchor after each turn", () => {
    const size = { width: 20, height: 20 };
    const origin = { x: 5, y: 7 };
    const turns: readonly QuarterTurns[] = [0, 1, 2, 3];
    const anchors = turns.map((turn) => toRoomFootprint({ turns: turn, origin, size }, tile(2, 4), 3));
    expect(anchors).toEqual([tile(7, 11), tile(1, 11), tile(1, 5), tile(7, 5)]);
  });

  test("a tile's centre lands on its room tile's centre, and its north-west corner turns with it", () => {
    const size = { width: 20, height: 20 };
    const origin = { x: 5, y: 7 };
    const turns: readonly QuarterTurns[] = [0, 1, 2, 3];
    const centres = turns.map((turn) => toRoomPoint({ turns: turn, origin, size }, { x: 2.5, y: 1.5 }));
    const corners = turns.map((turn) => toRoomPoint({ turns: turn, origin, size }, { x: 2, y: 1 }));
    expect(centres).toEqual([{ x: 7.5, y: 8.5 }, { x: 4.5, y: 9.5 }, { x: 3.5, y: 6.5 }, { x: 6.5, y: 5.5 }]);
    expect(corners).toEqual([{ x: 7, y: 8 }, { x: 5, y: 9 }, { x: 4, y: 7 }, { x: 6, y: 6 }]);
  });
});
