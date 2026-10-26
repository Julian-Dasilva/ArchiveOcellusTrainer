import type { DataPoint } from "../telemetry/perfSummary";
import { parseSummary, toDataPoint } from "../telemetry/perfSummary";

type PerfDataset = Readonly<{ writeDataPoint(point: DataPoint): void }>;

export type Env = Readonly<{
  ASSETS: Readonly<{ fetch(request: Request): Promise<Response> }>;
  PERF?: PerfDataset;
}>;

const BEACON_PATH = "/t";
const MAX_BODY_BYTES = 2048;

async function receiveSummary(request: Request, perf: PerfDataset): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const summary = parseSummary(body);
  if (!summary) return new Response(null, { status: 400 });
  perf.writeDataPoint(toDataPoint(summary));
  return new Response(null, { status: 204 });
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === BEACON_PATH) return env.PERF ? receiveSummary(request, env.PERF) : Promise.resolve(new Response(null, { status: 204 }));
    return env.ASSETS.fetch(request);
  },
};
