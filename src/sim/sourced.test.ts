import { span } from "./brands";
import type { TickSpan } from "./brands";
import { noWiki } from "./provenance";
import type { Evidence } from "./provenance";
import type { Selected } from "./sourced";
import { each, minus, plus } from "./sourced";

const evidence: Evidence<unknown, string> = {
  status: "unverified",
  basis: "assumption",
  scale: "fixture",
  note: "a sourced span",
  sources: [noWiki("unit fixture")],
};

function selected(value: number): Selected<TickSpan> {
  return { kind: "selected", value: span(value), evidence };
}

describe("sourced spans", () => {
  test("a later anchor minus an earlier one, their sum, and each member keep the literal values", () => {
    const later = selected(8);
    const earlier = selected(3);
    const list: Selected<readonly number[]> = { kind: "selected", value: [1, 2], evidence };
    expect(minus(later, earlier)).toEqual({ kind: "derived", value: span(5), how: "difference", from: [later, earlier] });
    expect(plus(later, earlier)).toEqual({ kind: "derived", value: span(11), how: "sum", from: [later, earlier] });
    expect(each(list)).toEqual([
      { kind: "derived", value: 1, how: "member", from: [list] },
      { kind: "derived", value: 2, how: "member", from: [list] },
    ]);
  });

  test("a beat cannot be anchored on a later beat", () => {
    expect(() => minus(selected(3), selected(8))).toThrow(/cannot follow/);
  });
});
