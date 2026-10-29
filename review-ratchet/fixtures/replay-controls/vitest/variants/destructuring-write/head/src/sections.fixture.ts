import { describe, expect, test } from "vitest";
import { position, problems } from "./sections";
import { ready } from "./tests/helper";

let OPENING = "Display";

describe("sections", () => {
  test("the helper is ready", () => {
    [OPENING] = ["Fight"];
    expect(ready()).toBe(true);
  });

  test("Fight comes first", () => {
    expect(position("Fight")).toBe(0);
  });
});
