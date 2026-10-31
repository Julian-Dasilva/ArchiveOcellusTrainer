import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

test("CI restores the OpenRS2 cache after a build-script edit", () => {
  const script = readFileSync("scripts/netlify-build.sh", "utf8");
  const hash = (contents) => createHash("sha256").update(contents).digest("hex");
  const before = hash(script);
  const after = hash(`${script}\nprintf 'unrelated build change\\n'\n`);
  let caches = 0;
  for (const file of readdirSync(".github/workflows").filter((name) => name.endsWith(".yml"))) {
    const workflow = readFileSync(`.github/workflows/${file}`, "utf8");
    for (const step of workflow.split(/^      - /m)) {
      if (!step.startsWith("uses: actions/cache@") || !/path: .*\/netlify-cache\s*$/m.test(step)) continue;
      caches++;
      const key = step.match(/^\s+key: (.+)$/m)?.[1];
      assert.ok(key, `${file} cache needs a key`);
      const saved = key.replace(/\$\{\{ hashFiles\('scripts\/netlify-build.sh'\) \}\}/g, before);
      const requested = key.replace(/\$\{\{ hashFiles\('scripts\/netlify-build.sh'\) \}\}/g, after);
      const restore = step.match(/^\s+restore-keys: \|\n((?:[ \t]+[^\n]*\n?)*)/m)?.[1]
        ?.trim().split(/\s+/) ?? [];
      assert.ok(saved === requested || restore.some((prefix) => saved.startsWith(prefix)),
        `${file} cannot restore ${saved} after a build-script edit requests ${requested}`);
    }
  }
  assert.ok(caches > 0, "the workflows must exercise an OpenRS2 cache");
});
