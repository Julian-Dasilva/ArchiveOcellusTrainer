import path from "node:path";
import { fileURLToPath } from "node:url";

// CI keeps the runner default. Two workers is the local cap so several checkouts do not each take every core.
export function maxWorkers(env = process.env) {
  if (env.CI) return undefined;
  const raw = env.VITEST_MAX_WORKERS ?? "2";
  if (!/^[1-9]\d*$/.test(raw)) throw new Error(`VITEST_MAX_WORKERS must be a positive integer, got ${raw}`);
  return Number(raw);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const workers = maxWorkers();
  process.stdout.write(workers === undefined ? "default\n" : `${workers}\n`);
}
