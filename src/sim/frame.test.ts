import { tile } from "./brands";
import type { QuarterTurns } from "./frame";
import { toLocal, toRoom } from "./frame";

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
});
