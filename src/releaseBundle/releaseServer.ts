import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";

const CHUNK = /\/full-fight\.[0-9a-f]+\.js$/;

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ogg": "audio/ogg",
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  ".bin": "application/octet-stream",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
};

export type ChunkFault = "503";

export type ReleaseServer = Readonly<{
  origin: string;
  chunkOutcomes: () => readonly string[];
  close: () => Promise<void>;
}>;

function insideDist(dist: string, pathname: string): string | null {
  const root = resolve(dist);
  const file = resolve(root, pathname.replace(/^\/+/, ""));
  const fromRoot = relative(root, file);
  if (fromRoot.startsWith(`..${sep}`) || fromRoot === "..") return null;
  return file;
}

export function startReleaseServer(dist: string, options: Readonly<{ chunkFaults: readonly ChunkFault[] }>): Promise<ReleaseServer> {
  const faults = [...options.chunkFaults];
  const outcomes: string[] = [];
  const server: Server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    if (CHUNK.test(pathname) && faults.length > 0) {
      const fault = faults.shift();
      if (fault === "503") {
        outcomes.push("503");
        response.writeHead(503, { "Content-Type": "text/plain", "Cache-Control": "no-store" }).end("unavailable");
        return;
      }
    }
    if (CHUNK.test(pathname)) outcomes.push("200");
    const located = insideDist(dist, pathname.endsWith("/") ? `${pathname}index.html` : pathname);
    if (located === null || !existsSync(located) || !statSync(located).isFile()) {
      response.writeHead(404, { "Cache-Control": "no-store" }).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": TYPES[extname(located)] ?? "application/octet-stream",
      "Content-Length": statSync(located).size,
      "Cache-Control": "no-store",
    });
    createReadStream(located).pipe(response);
  });
  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen({ port: 0, host: "127.0.0.1", backlog: 511 }, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("the release server has no port"));
        return;
      }
      resolveServer({
        origin: `http://127.0.0.1:${address.port}`,
        chunkOutcomes: () => outcomes,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}
