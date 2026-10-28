import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type BuiltScript = Readonly<{
  path: string;
  bytes: number;
  entry: boolean;
}>;

export function kib(bytes: number): number {
  return Math.ceil(bytes / 1024);
}

/** `/` is the only page, so every script the build emits counts toward it, the HTML's entry and any chunk it loads later. */
export function pageBytes(scripts: readonly BuiltScript[]): number {
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
      return { path, bytes: statSync(join(dist, path)).size, entry: entries.has(path) };
    });
}
