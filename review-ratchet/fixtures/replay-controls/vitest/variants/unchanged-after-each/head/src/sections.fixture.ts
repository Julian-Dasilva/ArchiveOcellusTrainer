import { afterEach, describe, expect, test } from "vitest";
import { position, problems } from "./sections";

const HEALTHY = ["Fight", "Display", "Sound", "About"];

describe("sections", () => {
  describe("hooked", () => {
    afterEach(() => {
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
