import { beforeEach, describe, expect, test } from "vitest";
import { position } from "./sections";

const HEALTHY = ["Fight", "Sound", "About"];

describe("sections", () => {
  describe("hooked", () => {
    beforeEach(() => () => {
      for (const section of HEALTHY) position(section);
    });

    test("the healthy page lists sections", () => {
      expect(HEALTHY.length).toBeGreaterThan(0);
    });
  });

  test("Fight comes first", () => {
    expect(position("Fight")).toBe(0);
  });
});
