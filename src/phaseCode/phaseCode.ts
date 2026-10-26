import type { BuildFlags } from "../flags";

type Phase = keyof BuildFlags;

export const PHASE_ONLY_MODULES: ReadonlyMap<string, readonly [Phase, ...Phase[]]> = new Map<string, readonly [Phase, ...Phase[]]>([
  ["src/content/ocellus/js/P2Region.ts", ["p2"]],
  ["src/content/ocellus/js/OcellusTimingsP2.ts", ["p2"]],
  ["src/content/ocellus/js/entities/P2Views.ts", ["p2"]],
  ["src/content/ocellus/js/mobs/OcellusP2.ts", ["p2"]],
  ["src/content/ocellus/js/mobs/PortalEmitter.ts", ["p2"]],
  ["src/content/ocellus/js/p2/arena.ts", ["p2"]],
  ["src/content/ocellus/js/p2/fight.ts", ["p2"]],
  ["src/content/ocellus/js/p2/schedule.ts", ["p2"]],
  ["src/content/ocellus/js/P3Region.ts", ["p3"]],
  ["src/content/ocellus/js/mobs/OcellusP3.ts", ["p3"]],
  ["src/content/ocellus/js/p3/fight.ts", ["p3"]],
  ["src/content/ocellus/js/p3/schedule.ts", ["p3"]],
  ["src/content/ocellus/js/entities/P3Marks.ts", ["p3"]],
  ["src/content/ocellus/js/P1Region.ts", ["p1"]],
  ["src/content/ocellus/js/OcellusTimingsP1.ts", ["p1"]],
  ["src/content/ocellus/js/P1Types.ts", ["p1"]],
  ["src/content/ocellus/js/entities/P1Views.ts", ["p1"]],
  ["src/content/ocellus/js/mobs/OcellusP1.ts", ["p1"]],
  ["src/content/ocellus/js/p1/arena.ts", ["p1"]],
  ["src/content/ocellus/js/p1/fight.ts", ["p1"]],
  ["src/content/ocellus/js/p1/schedule.ts", ["p1"]],
  ["src/content/ocellus/js/p3/arena.ts", ["p1", "p2", "p3"]],
  ["src/content/ocellus/js/OcellusTimingsP3.ts", ["p1", "p2", "p3"]],
]);

export type StrayModule = Readonly<{ module: string; phases: readonly Phase[] }>;

export function strayPhaseModules(sources: readonly string[], flags: BuildFlags): readonly StrayModule[] {
  return sources.flatMap((source) => {
    const module = source.replace(/^webpack:\/\/[^/]*\/\.\//, "");
    const phases = PHASE_ONLY_MODULES.get(module);
    return phases !== undefined && !phases.some((phase) => flags[phase]) ? [{ module, phases }] : [];
  });
}
