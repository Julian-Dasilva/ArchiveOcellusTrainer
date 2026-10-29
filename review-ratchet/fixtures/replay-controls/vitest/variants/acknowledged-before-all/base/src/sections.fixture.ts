import { beforeAll, describe, expect, test } from "vitest";
import { position, problems } from "./sections";

const HEALTHY = ["Fight", "Sound", "About"];

describe("sections", () => {
  describe("hooked", () => {
    beforeAll(() => {
      for (const section of HEALTHY) position(section);
    });

    test("a healthy page has no problems", () => {
      expect(problems(HEALTHY)).toEqual([]);
    });
  });

  test("Fight comes first", () => {
    expect(position("Fight")).toBe(0);
  });
});
