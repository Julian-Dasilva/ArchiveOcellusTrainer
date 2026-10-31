import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("CI cache keys cover content inputs and restore previous entries", () => {
  const inputs = ["scripts/netlify-build.sh", "osrs-assets.config.ts", "scripts/install-beta-sdk.sh"];
  let caches = 0;
  for (const file of readdirSync(".github/workflows").filter((name) => name.endsWith(".yml"))) {
    const workflow = readFileSync(`.github/workflows/${file}`, "utf8");
    for (const step of workflow.split(/^      - /m)) {
      if (!/^\s*uses: actions\/cache@/m.test(step) || !/path: .*\/netlify-cache\s*$/m.test(step)) continue;
      caches++;
      const key = step.match(/^\s+key: (.+)$/m)?.[1];
      assert.ok(key, `${file} cache needs a key`);
      const restore = step.match(/^\s+restore-keys: \|\n((?:[ \t]+[^\n]*\n?)*)/m)?.[1]
        ?.trim().split(/\s+/).filter(Boolean) ?? [];
      assert.ok(restore.some((prefix) => key.startsWith(prefix)),
        `${file} cache key must start with a restore-keys prefix`);
      const hashFiles = [...key.matchAll(/\$\{\{\s*hashFiles\(([^)]*)\)\s*\}\}/g)]
        .flatMap((match) => [...match[1].matchAll(/'([^']+)'/g)].map((input) => input[1]));
      for (const input of inputs) {
        assert.ok(hashFiles.includes(input), `${file} cache key must hash ${input}`);
      }
    }
  }
  assert.ok(caches > 0, "the workflows must exercise an OpenRS2 cache");
});

test("the assets base build cannot rewrite the head cache", () => {
  const workflow = readFileSync(".github/workflows/test.yml", "utf8");
  const step = workflow.split(/^      - /m).find((part) => part.startsWith("name: Extract the base's assets"));
  assert.ok(step, "the assets job must build the base");
  const run = step.match(/^        run: (?:\|\n([\s\S]*)|([^\n]+))/m);
  assert.ok(run, "the base build needs a command");
  const command = (run[1] ?? run[2]).replace(/^          /gm, "");
  const work = mkdtempSync(join(tmpdir(), "ci-base-cache-"));
  try {
    const repo = join(work, "repo");
    const cache = join(work, "netlify-cache");
    mkdirSync(join(repo, "scripts"), { recursive: true });
    mkdirSync(cache);
    writeFileSync(join(cache, "entry"), "head");
    // A historical base may overwrite or prune every inherited cache entry.
    writeFileSync(join(repo, "scripts/netlify-build.sh"), 'printf base >"$NETLIFY_CACHE_DIR/entry"\n');
    execFileSync("git", ["init", "--quiet", repo]);
    execFileSync("git", ["-C", repo, "add", "scripts/netlify-build.sh"]);
    execFileSync("git", ["-C", repo, "-c", "user.name=Cache test", "-c", "user.email=cache@example.invalid", "commit", "--quiet", "-m", "base fixture"]);
    execFileSync("bash", ["-euc", command], {
      cwd: repo,
      env: { ...process.env, RUNNER_TEMP: work, NETLIFY_CACHE_DIR: cache, BASE: "HEAD" },
      stdio: "pipe",
    });
    assert.equal(readFileSync(join(cache, "entry"), "utf8"), "head", "the base build rewrote the cache saved under the head key");
    assert.equal(readFileSync(join(work, "base-netlify-cache/entry"), "utf8"), "base", "the base build must run against its own writable cache");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
