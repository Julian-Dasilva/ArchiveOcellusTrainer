import { describe, expect, test } from "vitest";
import { position, problems } from "./sections";

const HEALTHY = ["Fight", "Display", "Sound", "About"];
const UNREAD = position("Display");

describe("sections", () => {
  test("a healthy page has no problems", () => {
    expect(problems(HEALTHY)).toEqual([]);
  });
});
