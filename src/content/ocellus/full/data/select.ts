import type { FightLog, Source } from "../../js/OcellusTimings";
import type { Basis, Citations } from "../../../../sim/provenance";
import { noWiki, wiki } from "../../../../sim/provenance";
import type { Selected } from "../../../../sim/sourced";

type Scale = "unscaled";

export function selected<T>(value: T, basis: Basis, scale: Scale, note: string, ...sources: Citations<Source>): Selected<T> {
  return { kind: "selected", value, evidence: { status: "unverified", basis, scale, note, sources } };
}

export const fightLog = (log: FightLog, at: string): Source => ({ kind: "fight-log", log, at });
export const analysis = (url: string, at: string): Source => ({ kind: "analysis", url, at });
export const guide = (url: string, at: string): Source => ({ kind: "guide", url, at });
export const cache = (record: string): Source => ({ kind: "cache", build: 2746, record });
export const news = (url: string): Source => ({ kind: "news", url });
export const ocellusSim = (at: string): Source => ({ kind: "ocellus-sim", commit: "75bd193", at });

export { noWiki, wiki };
