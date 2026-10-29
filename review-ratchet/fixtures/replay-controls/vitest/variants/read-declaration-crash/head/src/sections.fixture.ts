import { describe, expect, test } from "vitest";
import { position, problems } from "./sections";

const DISPLAY_FOLLOWS_FIGHT = position("Display") === 1;

describe("sections", () => {
  test("Display follows Fight", () => {
    expect(DISPLAY_FOLLOWS_FIGHT).toBe(true);
  });
});
