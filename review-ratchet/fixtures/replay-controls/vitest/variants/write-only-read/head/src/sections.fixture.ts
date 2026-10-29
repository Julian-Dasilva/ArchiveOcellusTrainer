import { describe, expect, test } from "vitest";
import { position, problems } from "./sections";
import { ready } from "./tests/helper";

let OPENING = "Display";
const EMPTY: string[] = [];

describe("sections", () => {
  test("an empty page misses Fight", () => {
    OPENING = "Fight";
    expect(ready()).toBe(true);
    expect(problems(EMPTY)).toContain("Fight is missing");
  });

  test("Fight comes first", () => {
    expect(position("Fight")).toBe(0);
  });
});
