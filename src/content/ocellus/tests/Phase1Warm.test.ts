import { warmPlacements } from "../fight/warmup";

describe("phase 1 actor warmup", () => {
  test("a repeated graphic id shares a warm channel and is refused", () => {
    expect(() => warmPlacements([
      ["boss", 4228],
      ["player", 4228],
    ])).toThrow("phase 1 warm graphics share a channel");
  });

  test("two different graphic ids get two warm channels", () => {
    expect(warmPlacements([
      ["boss", 4228],
      ["boss", 4231],
    ])).toEqual([
      { actor: "boss", id: 4228, channel: "p1-warm-4228" },
      { actor: "boss", id: 4231, channel: "p1-warm-4231" },
    ]);
  });
});
