#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

const usage = `usage: affected-tests.mjs [CHANGED_PATH...]

Prints two lines: the unit-test scope for those paths, then the reason.
  all     run the whole Vitest suite
  none    no unit test applies
  related ask Vitest for the tests those source files affect
`;

const GLOBALS = new Set([
  "vitest.config.mts",
  "test/parity/vitest.config.mts",
  "test/setupFiles.ts",
  "test/workerCap.mjs",
  "scripts/verify/affected-tests.mjs",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
]);

const SOURCE = /^(src|test)\/.*\.(?:ts|tsx|js|mjs|cjs|json)$/;

export function unitScope(paths) {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return { kind: "all", reason: "no changed files, so the suite runs" };
  if (unique.some((file) => GLOBALS.has(file))) return { kind: "all", reason: "a test runner file changed, so the suite runs" };
  if (!unique.some((file) => SOURCE.test(file))) return { kind: "none", reason: "no source file changed, so no unit test runs" };
  return { kind: "related", reason: "Vitest runs the tests the changed source files affect" };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    process.stdout.write(usage);
    process.exit(0);
  }
  const decision = unitScope(process.argv.slice(2));
  process.stdout.write(`${decision.kind}\n${decision.reason}\n`);
}
