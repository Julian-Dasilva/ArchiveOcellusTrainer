declare const unitBrand: unique symbol;
export type UnitId = string & { readonly [unitBrand]: true };

type Glob = Readonly<{ text: string; pattern: RegExp }>;
type Rule = Readonly<{ globs: readonly Glob[]; units: readonly UnitId[] }>;

export type Impact = Readonly<{
  units: readonly UnitId[];
  stages: ReadonlyMap<UnitId, string>;
  everything: readonly Glob[];
  t0Only: readonly Glob[];
  rules: readonly Rule[];
  unitModule: (path: string) => UnitId | null;
}>;

export type Selection =
  | Readonly<{ kind: "nothing"; path: string; glob: string }>
  | Readonly<{ kind: "units"; path: string; units: readonly UnitId[]; globs: readonly string[] }>
  | Readonly<{ kind: "everything"; path: string; glob: string }>
  | Readonly<{ kind: "unknown"; path: string }>;

export type Plan =
  | Readonly<{ tier: "t0"; units: readonly []; selections: readonly Selection[] }>
  | Readonly<{ tier: "t1"; units: readonly [UnitId, ...UnitId[]]; selections: readonly Selection[] }>
  | Readonly<{ tier: "t2"; units: readonly UnitId[]; selections: readonly Selection[] }>;

const UNIT_MODULE = /^scripts\/verify\/units\/([a-z0-9_]+)\.mjs$/;
const isUnitId = (name: string): name is UnitId => /^[a-z0-9_]+$/.test(name);

function unitId(name: string): UnitId {
  if (!isUnitId(name)) throw new Error(`not a unit name: ${name}`);
  return name;
}

function compileGlob(text: string): Glob {
  const source = text
    .split(/(\*\*\/|\/\*\*$|\*\*|\*)/)
    .map((part) => {
      switch (part) {
        case "**/":
          return "(?:.*/)?";
        case "/**":
          return "(?:/.*)?";
        case "**":
          return ".*";
        case "*":
          return "[^/]*";
        default:
          return part.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      }
    })
    .join("");
  return { text, pattern: new RegExp(`^${source}$`) };
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown, at: string): readonly string[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`${at} is not a list of strings`);
  return value;
};

export function parseImpact(json: unknown, browserUnits: readonly string[]): Impact {
  if (!isRecord(json) || !isRecord(json.groups) || !Array.isArray(json.rules)) throw new Error("the impact map needs stages, groups, everything, t0Only and rules");
  const known = new Map<string, UnitId>();
  if (!isRecord(json.stages)) throw new Error("stages is not an object of unit to verify.sh stage");
  const stageNames = Object.entries(json.stages).map(([name, stage]): readonly [string, string] => {
    if (typeof stage !== "string") throw new Error(`stage unit ${name} names no verify.sh stage`);
    return [name, stage];
  });
  for (const name of [...browserUnits, ...stageNames.map(([name]) => name)]) {
    if (known.has(name)) throw new Error(`unit ${name} is named twice`);
    known.set(name, unitId(name));
  }
  const unit = (name: string, at: string): UnitId => {
    const found = known.get(name);
    if (found === undefined) throw new Error(`${at} names ${name}, which is no unit`);
    return found;
  };
  const groups = new Map(Object.entries(json.groups).map(([name, members]) => [name, strings(members, `group ${name}`).map((member) => unit(member, `group ${name}`))]));
  const resolve = (name: string, at: string): readonly UnitId[] => {
    if (!name.startsWith("@")) return [unit(name, at)];
    const members = groups.get(name.slice(1));
    if (members === undefined) throw new Error(`${at} names group ${name}, which does not exist`);
    return members;
  };
  const rules = json.rules.map((rule: unknown, n): Rule => {
    if (!isRecord(rule)) throw new Error(`rule ${n} is not an object`);
    return { globs: strings(rule.paths, `rule ${n} paths`).map(compileGlob), units: strings(rule.units, `rule ${n} units`).flatMap((name) => resolve(name, `rule ${n}`)) };
  });
  const units = [...known.values()];
  return {
    units,
    stages: new Map(stageNames.map(([name, stage]) => [unit(name, "stages"), stage])),
    everything: strings(json.everything, "everything").map(compileGlob),
    t0Only: strings(json.t0Only, "t0Only").map(compileGlob),
    rules,
    unitModule: (path) => {
      const id = UNIT_MODULE.exec(path)?.[1];
      return id === undefined ? null : (known.get(id) ?? null);
    },
  };
}

const firstMatch = (globs: readonly Glob[], path: string): Glob | undefined => globs.find(({ pattern }) => pattern.test(path));

export function select(impact: Impact, path: string): Selection {
  const everything = firstMatch(impact.everything, path);
  if (everything !== undefined) return { kind: "everything", path, glob: everything.text };
  const matched = impact.rules.flatMap((rule) => {
    const glob = firstMatch(rule.globs, path);
    return glob === undefined ? [] : [{ glob: glob.text, units: rule.units }];
  });
  const own = impact.unitModule(path);
  if (own !== null) matched.push({ glob: "scripts/verify/units/<unit>.mjs", units: [own] });
  if (matched.length > 0) {
    const selected = new Set(matched.flatMap(({ units }) => units));
    return { kind: "units", path, units: impact.units.filter((id) => selected.has(id)), globs: matched.map(({ glob }) => glob) };
  }
  const t0Only = firstMatch(impact.t0Only, path);
  if (t0Only !== undefined) return { kind: "nothing", path, glob: t0Only.text };
  return { kind: "unknown", path };
}

export function plan(impact: Impact, paths: readonly string[]): Plan {
  const selections = [...new Set(paths)].sort().map((path) => select(impact, path));
  if (selections.some(({ kind }) => kind === "everything" || kind === "unknown")) return { tier: "t2", units: impact.units, selections };
  const selected = new Set(selections.flatMap((selection) => (selection.kind === "units" ? selection.units : [])));
  const [first, ...rest] = impact.units.filter((id) => selected.has(id));
  return first === undefined ? { tier: "t0", units: [], selections } : { tier: "t1", units: [first, ...rest], selections };
}

export function explain(selection: Selection): string {
  switch (selection.kind) {
    case "nothing":
      return `${selection.path} selects no unit (${selection.glob})`;
    case "units":
      return `${selection.path} selects ${selection.units.join(", ")} (${selection.globs.join(", ")})`;
    case "everything":
      return `${selection.path} selects everything (${selection.glob})`;
    case "unknown":
      return `${selection.path} is in no rule, so it selects everything`;
    default: {
      const unknownKind: never = selection;
      throw new Error(`unknown selection ${JSON.stringify(unknownKind)}`);
    }
  }
}

export function runCommand(impact: Impact, selected: Plan): string {
  const browser = selected.units.filter((id) => !impact.stages.has(id));
  const stages = selected.units.flatMap((id) => impact.stages.get(id) ?? []);
  const words = selected.tier === "t2" ? ["browser", ...impact.stages.values()] : [...(browser.length > 0 ? ["browser", ...browser.flatMap((id) => ["--unit", id])] : []), ...stages];
  return ["scripts/verify.sh", "t0", ...words].join(" ");
}
