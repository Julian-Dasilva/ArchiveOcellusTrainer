import type { Quadrant } from "../fight/geometry";
import { p4CameraFacing } from "../full/fall";

const LEFT: readonly (readonly [readonly Quadrant[], string])[] = [
  [["SE", "SW", "NW"], "east"],
  [["NE", "SW", "NW"], "south"],
  [["NE", "SE", "NW"], "west"],
  [["NE", "SE", "SW"], "north"],
];

describe("phase 4 camera", () => {
  test("the standing quadrant keeps local south at the top of the screen", () => {
    expect(LEFT.map(([destroyed]) => p4CameraFacing(destroyed))).toEqual(LEFT.map(([, facing]) => facing));
  });

  test("a floor that is not one standing quadrant has no phase 4 facing", () => {
    expect([p4CameraFacing([]), p4CameraFacing(["NE", "SE", "SW", "NW"])]).toEqual([null, null]);
  });
});
