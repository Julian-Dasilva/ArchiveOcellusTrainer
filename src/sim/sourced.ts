import type { TickSpan } from "./brands";
import { span } from "./brands";
import type { Evidence } from "./provenance";

/** A boss's own data module builds these with its `selected(value, basis, scale, note, ...sources)`. */
export type Selected<T> = Readonly<{ kind: "selected"; value: T; evidence: Evidence<unknown, string> }>;
export type Derived<T> = Readonly<{ kind: "derived"; value: T; how: "difference" | "sum" | "member"; from: readonly [Sourced<unknown>, ...Sourced<unknown>[]] }>;
/** Every timing, count, damage and look an engine call takes. A bare number does not compile in its place. */
export type Sourced<T> = Selected<T> | Derived<T>;

export type DamageRange = Readonly<{ min: number; max: number }>;

/** `later` minus `earlier`, for a beat anchored on another beat. Throws when the data puts `later` first. */
export function minus(later: Sourced<TickSpan>, earlier: Sourced<TickSpan>): Derived<TickSpan> {
  if (later.value < earlier.value) throw new RangeError(`a beat at ${later.value} cannot follow one at ${earlier.value}`);
  return { kind: "derived", value: span(later.value - earlier.value), how: "difference", from: [later, earlier] };
}

export function plus(left: Sourced<TickSpan>, right: Sourced<TickSpan>): Derived<TickSpan> {
  return { kind: "derived", value: span(left.value + right.value), how: "sum", from: [left, right] };
}

export function each<T>(list: Sourced<readonly T[]>): readonly Derived<T>[] {
  return list.value.map((value) => ({ kind: "derived", value, how: "member", from: [list] }));
}
