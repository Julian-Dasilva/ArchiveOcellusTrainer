import { OCELLUS_P4 } from "../js/OcellusTimings";
import { p4WarmSpotIds, warmPlacements } from "../fight/warmup";

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

describe("phase 4 graphic warmup", () => {
  test("the lifeforce tell and the boss levitation are among the graphics warmed before phase 4", () => {
    const ids = p4WarmSpotIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      OCELLUS_P4.lifeforceOrb.look.tell.value,
      OCELLUS_P4.presentation.levitation.value.spotAnim,
    ]));
  });
});
