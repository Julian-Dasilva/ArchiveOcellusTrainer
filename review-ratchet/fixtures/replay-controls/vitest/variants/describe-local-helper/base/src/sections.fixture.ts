import { describe, expect, test } from "vitest";
import { position, problems } from "./sections";

const HEALTHY = ["Fight", "Sound", "About"];

describe("sections", () => {
  const healthyPage = () => HEALTHY;

  test("a healthy page has no problems", () => {
    expect(problems(healthyPage())).toEqual([]);
  });

  test("Fight comes first", () => {
    expect(position("Fight")).toBe(0);
  });
});
