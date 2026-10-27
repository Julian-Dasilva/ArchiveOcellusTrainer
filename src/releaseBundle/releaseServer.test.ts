import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startReleaseServer } from "./releaseServer";

function request(url: string): Promise<Readonly<{ status: number; body: string }>> {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    }).on("error", reject);
  });
}

test("the first full-fight request is a 503 and the next one is the file", async () => {
  const dist = mkdtempSync(join(tmpdir(), "release-server-"));
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "index.html"), "<p>ok</p>");
  writeFileSync(join(dist, "assets", "full-fight.abc123.js"), "fight();");
  const server = await startReleaseServer(dist, { chunkFaults: ["503"] });
  try {
    const page = await request(`${server.origin}/`);
    const first = await request(`${server.origin}/assets/full-fight.abc123.js`);
    const second = await request(`${server.origin}/assets/full-fight.abc123.js`);
    expect({ page: page.status, first: first.status, second: second.status, body: second.body, outcomes: server.chunkOutcomes() }).toEqual({
      page: 200,
      first: 503,
      second: 200,
      body: "fight();",
      outcomes: ["503", "200"],
    });
  } finally {
    await server.close();
    rmSync(dist, { recursive: true, force: true });
  }
});
