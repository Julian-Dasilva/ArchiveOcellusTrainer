import path from "node:path";
import { fileURLToPath } from "node:url";

export function maxWorkers(env = process.env) {
  if (env.CI) return { kind: "runner" };
  const raw = env.VITEST_MAX_WORKERS ?? "2";
  if (!/^[1-9]\d*$/.test(raw)) throw new Error(`VITEST_MAX_WORKERS must be a positive integer, got ${raw}`);
  return { kind: "count", workers: Number(raw) };
}

export function testWorkerOption(env = process.env) {
  const cap = maxWorkers(env);
  switch (cap.kind) {
    case "runner":
      return {};
    case "count":
      return { maxWorkers: cap.workers };
    default: {
      throw new Error(`unknown worker cap ${JSON.stringify(cap)}`);
    }
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cap = maxWorkers();
  switch (cap.kind) {
    case "runner":
      process.stdout.write("default\n");
      break;
    case "count":
      process.stdout.write(`${cap.workers}\n`);
      break;
    default: {
      throw new Error(`unknown worker cap ${JSON.stringify(cap)}`);
    }
  }
}
