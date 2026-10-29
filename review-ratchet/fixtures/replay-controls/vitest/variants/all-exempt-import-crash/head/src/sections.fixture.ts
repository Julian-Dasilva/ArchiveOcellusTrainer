import { describe, expect, test } from "vitest";
import { position, problems } from "./sections";

const HEALTHY: string[] = (await import("./headOnly")).HEALTHY;

describe("sections", () => {
  test("a healthy page has no problems", () => {
    expect(problems(HEALTHY)).toEqual([]);
  });
});
