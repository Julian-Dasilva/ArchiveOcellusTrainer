import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

export const SCRIPT_ROLES = ["entry", "sidebar", "full-fight", "other"] as const;
export type ScriptRole = (typeof SCRIPT_ROLES)[number];
export type PageName = "drill" | "full";

export type BuiltScript = Readonly<{
  path: string;
  bytes: number;
  role: ScriptRole;
}>;

/** `/` loads the HTML scripts, the sidebar chunk, and any script with no page role. `?mode=full` loads the HTML scripts, the full-fight chunk, and any script with no page role. */
const PAGE_ROLES: Readonly<Record<PageName, readonly ScriptRole[]>> = {
  drill: ["entry", "sidebar", "other"],
  full: ["entry", "full-fight", "other"],
};

export function kib(bytes: number): number {
  return Math.ceil(bytes / 1024);
}

export function scriptRole(path: string, entryPaths: ReadonlySet<string>): ScriptRole {
  if (entryPaths.has(path)) return "entry";
  const name = basename(path);
  if (name.startsWith("sidebar.") && name.endsWith(".js")) return "sidebar";
  if (name.startsWith("full-fight.") && name.endsWith(".js")) return "full-fight";
  return "other";
}

export function pageBytes(scripts: readonly BuiltScript[], page: PageName): number {
  const roles = PAGE_ROLES[page];
  return scripts.reduce((sum, script) => (roles.includes(script.role) ? sum + script.bytes : sum), 0);
}

export function everyScriptBytes(scripts: readonly BuiltScript[]): number {
  return scripts.reduce((sum, script) => sum + script.bytes, 0);
}

export function htmlEntryPaths(html: string): ReadonlySet<string> {
  const paths = [...html.matchAll(/\bsrc=(?:"([^"]+\.js)"|'([^']+\.js)'|([^\s>]+\.js))/g)].flatMap((match) => {
    const path = match[1] ?? match[2] ?? match[3];
    return path === undefined ? [] : [path.replace(/^\.\//, "")];
  });
  return new Set(paths);
}

export function builtScripts(dist: string): readonly BuiltScript[] {
  const entries = htmlEntryPaths(readFileSync(join(dist, "index.html"), "utf8"));
  return readdirSync(dist, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => {
      const path = relative(dist, join(entry.parentPath, entry.name)).split(sep).join("/");
      return { path, bytes: statSync(join(dist, path)).size, role: scriptRole(path, entries) };
    });
}
