import { describe, expect, test } from "vitest";
import { position, problems } from "./sections";
import { ready } from "./tests/helper";

class Page {
  open = false;
}

describe("sections", () => {
  test("the helper is ready", () => {
    class Local implements Page {
      open = true;
    }
    expect(new Local().open).toBe(true);
    expect(ready()).toBe(true);
  });

  test("Fight comes first", () => {
    expect(position("Fight")).toBe(0);
  });
});
