import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";

for (const bytes of [[], [0x50, 0x4b, 0x03, 0x04]]) {
  test(`a corrupt ${bytes.length}-byte archive fails with its URL and byte count`, () => {
    const dir = mkdtempSync(join(tmpdir(), "ocellus-download-"));
    try {
      const transport = join(dir, "openrs2.mjs");
      const requests = join(dir, "requests.json");
      // Only OpenRS2 HTTP responses are replaced. The installed SDK and asset CLI run unchanged.
      writeFileSync(transport, `
        import { writeFileSync } from "node:fs";
        const requests = [];
        globalThis.fetch = async (input) => {
          const url = String(input);
          requests.push(url);
          writeFileSync(${JSON.stringify(requests)}, JSON.stringify(requests));
          if (url === "https://archive.openrs2.org/caches.json") return Response.json([
            { id: 2746, game: "oldschool", disk_store_valid: true, scope: "runescape", builds: [{ major: 238 }] }
          ]);
          if (url === "https://archive.openrs2.org/caches/runescape/2746/disk.zip")
            return new Response(Uint8Array.from(${JSON.stringify(bytes)}));
          throw new Error("Unexpected request " + url);
        };
      `);
      const result = spawnSync("npm", ["run", "assets", "--", "--cache-dir", join(dir, "cache"), "--out-dir", join(dir, "out")], {
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(transport).href}` },
        timeout: 30_000,
      });
      assert.ifError(result.error);
      const output = result.stdout + result.stderr;
      assert.notEqual(result.status, 0, output);
      assert.ok(existsSync(requests), `the asset CLI must reach OpenRS2\n${output}`);
      const urls = JSON.parse(readFileSync(requests, "utf8"));
      const url = "https://archive.openrs2.org/caches/runescape/2746/disk.zip";
      assert.equal(urls.filter((requested) => requested === url).length, 1, "corruption must not add download retries");
      assert.equal(existsSync(join(dir, "cache/2746/openrs2.json")), false, "a corrupt download must not be published");
      assert.ok(output.includes(url), `the failure must name the archive URL\n${output}`);
      assert.ok(output.includes(`${bytes.length} bytes`), `the failure must report received bytes\n${output}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
