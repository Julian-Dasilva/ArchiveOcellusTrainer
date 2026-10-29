import { describe, expect, test } from "vitest";
import { position, problems } from "./sections";

const HEALTHY = ["Fight", "Display", "Sound", "About"];
const EMPTY: string[] = [];
const DISPLAY_AT = position("Display");

function healthyPage(): string[] {
  return [...HEALTHY];
}

function pageWithout(section: string): string[] {
  return healthyPage().filter((name) => name !== section);
}

describe("sections", () => {
  test("a healthy page has no problems", () => {
    expect(problems(healthyPage())).toEqual([]);
  });

  test("a page without About misses only About", () => {
    expect(problems(pageWithout("About"))).toEqual(["About is missing"]);
  });

  test("an empty page misses Fight", () => {
    expect(problems(EMPTY)).toContain("Fight is missing");
  });

  test("Fight comes first", () => {
    expect(position("Fight")).toBe(0);
  });

  test("Display follows Fight", () => {
    expect(position("Display")).toBe(1);
  });

  test("Display sits at its position", () => {
    expect(DISPLAY_AT).toBe(1);
  });
});
