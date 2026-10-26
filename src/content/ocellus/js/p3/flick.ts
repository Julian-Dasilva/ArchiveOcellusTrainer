import type { Style } from "../../../../sim/combat";
import type { FlickRule, SpinVerdict } from "../P3Types";

export type Flick = "unarmed" | "armed" | "lowered" | "raised" | "knocked";

export function armFlick(rule: FlickRule, meleeOn: boolean): Flick {
  if (meleeOn) return "armed";
  switch (rule) {
    case "on-off-on":
      return "unarmed";
    case "off-then-on":
    case "held-blocks":
      return "lowered";
    default: {
      const unhandled: never = rule;
      return unhandled;
    }
  }
}

export function stepFlick(flick: Flick, meleeOn: boolean): Flick {
  switch (flick) {
    case "unarmed":
    case "knocked":
      return flick;
    case "armed":
    case "raised":
      return meleeOn ? flick : "lowered";
    case "lowered":
      return meleeOn ? "raised" : "lowered";
    default: {
      const unhandled: never = flick;
      return unhandled;
    }
  }
}

export function settleFlick(rule: FlickRule, flick: Flick, protection: Style | null): Flick {
  switch (rule) {
    case "off-then-on":
      return protection === null ? "lowered" : "knocked";
    case "on-off-on":
    case "held-blocks":
      return flick;
    default: {
      const unhandled: never = rule;
      return unhandled;
    }
  }
}

export function judgeSpin(rule: FlickRule, flick: Flick): SpinVerdict {
  switch (flick) {
    case "raised":
      return { kind: "blocked" };
    case "armed":
      return rule === "held-blocks" ? { kind: "blocked" } : { kind: "struck", why: "held" };
    case "lowered":
      return { kind: "struck", why: "late" };
    case "unarmed":
      return { kind: "struck", why: "early" };
    case "knocked":
      return { kind: "struck", why: "knocked" };
    default: {
      const unhandled: never = flick;
      return unhandled;
    }
  }
}
