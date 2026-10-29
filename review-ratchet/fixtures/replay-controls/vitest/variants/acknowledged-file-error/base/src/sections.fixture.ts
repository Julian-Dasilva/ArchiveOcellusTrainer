import { afterAll, describe, expect, test } from "vitest";
import { position, problems } from "./sections";

const HEALTHY = ["Fight", "Sound", "About"];

afterAll(() => {
  for (const section of HEALTHY) position(section);
});

describe("sections", () => {
  test("a healthy page has no problems", () => {
    expect(problems(HEALTHY)).toEqual([]);
  });

  test("Fight comes first", () => {
    expect(position("Fight")).toBe(0);
  });
});
