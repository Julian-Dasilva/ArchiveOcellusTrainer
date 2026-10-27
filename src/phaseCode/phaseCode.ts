import type { BuildFlags } from "../flags";

type Phase = keyof BuildFlags;

/** A module under one of these directories belongs to those phases, so a new file does not need its own map entry. */
export const PHASE_DIRECTORIES: readonly (readonly [string, readonly [Phase, ...Phase[]]])[] = [
  ["src/content/ocellus/full/", ["full"]],
  ["src/content/ocellus/fight/", ["full"]],
];

/** Directories named above that are not on disk. A missing one would make every file under that prefix invisible to the rule. */
export function missingPhaseDirectories(exists: (directory: string) => boolean): readonly string[] {
  return PHASE_DIRECTORIES.flatMap(([directory]) => (exists(directory) ? [] : [directory]));
}

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
  ["src/fullFightStyles.ts", ["full"]],
  ["src/content/ocellus/js/carry.ts", ["full"]],
  ["src/menu/Sidebar.tsx", ["full"]],
]);

export type StrayModule = Readonly<{ module: string; phases: readonly Phase[] }>;

function phasesOf(module: string): readonly Phase[] | undefined {
  const directory = PHASE_DIRECTORIES.find(([prefix]) => module.startsWith(prefix));
  if (directory) return directory[1];
  return PHASE_ONLY_MODULES.get(module);
}

export function strayPhaseModules(sources: readonly string[], flags: BuildFlags): readonly StrayModule[] {
  return sources.flatMap((source) => {
    const module = source.replace(/^webpack:\/\/[^/]*\/\.\//, "");
    const phases = phasesOf(module);
    return phases !== undefined && !phases.some((phase) => flags[phase]) ? [{ module, phases }] : [];
  });
}
