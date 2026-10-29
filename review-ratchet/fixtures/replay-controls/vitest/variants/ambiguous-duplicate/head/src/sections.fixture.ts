import { describe, expect, test } from "vitest";
import { position, problems } from "./sections";

const HEALTHY = ["Fight", "Display", "Sound", "About"];

describe("sections", () => {
  test("a healthy page has no problems", () => {
    expect(problems(HEALTHY)).toEqual([]);
  });

  test("a healthy page has no problems", () => {
    expect(problems([...HEALTHY])).toEqual([]);
  });

  test("Fight comes first", () => {
    expect(position("Fight")).toBe(0);
  });
});
