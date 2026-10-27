const USAGE = "usage: devtools.ts throttle <cdp url> <target id> <rate> | heap <cdp url> <target id> | open <cdp url> <target id> <page url>";
const DOCUMENT_PARSE_MS = 25_000;

type Command = Readonly<{ kind: "throttle"; rate: number }> | Readonly<{ kind: "heap" }> | Readonly<{ kind: "open"; pageUrl: string }>;
type Session = Readonly<{
  send: (method: string, params?: object) => Promise<unknown>;
  closed: Promise<void>;
  close: () => void;
  listen: (onMessage: (message: unknown) => void) => void;
}>;

function property(raw: unknown, key: string): unknown {
  return typeof raw === "object" && raw !== null && key in raw ? Object.getOwnPropertyDescriptor(raw, key)?.value : undefined;
}

function count(raw: unknown, key: string): number {
  const value = property(raw, key);
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`DevTools answered without a numeric ${key}`);
  return value;
}

async function attach(url: string, targetId: string): Promise<Session> {
  const socket = new WebSocket(url);
  const replies = new Map<number, Readonly<{ resolve: (result: unknown) => void; reject: (error: Error) => void }>>();
  let next = 0;
  const closed = new Promise<void>((resolve) => socket.addEventListener("close", () => resolve()));
  const listeners = new Set<(message: unknown) => void>();
  socket.addEventListener("message", ({ data }) => {
    const message: unknown = JSON.parse(String(data));
    listeners.forEach((onMessage) => onMessage(message));
    const id = property(message, "id");
    const reply = typeof id === "number" ? replies.get(id) : undefined;
    if (reply === undefined) return;
    const error = property(message, "error");
    if (error === undefined) reply.resolve(property(message, "result"));
    else reply.reject(new Error(`DevTools refused: ${JSON.stringify(error)}`));
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", () => reject(new Error(`cannot reach DevTools at ${url}`)));
  });
  const call = (method: string, params: object = {}, sessionId?: string) =>
    new Promise<unknown>((resolve, reject) => {
      const id = ++next;
      replies.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const sessionId = property(await call("Target.attachToTarget", { targetId, flatten: true }), "sessionId");
  if (typeof sessionId !== "string") throw new TypeError(`DevTools did not attach to target ${targetId}`);
  return { send: (method, params) => call(method, params, sessionId), closed, close: () => socket.close(), listen: (onMessage) => listeners.add(onMessage) };
}

function parse(args: readonly string[]): Readonly<{ url: string; targetId: string; command: Command }> {
  const [kind, url, targetId, fourth] = args;
  if (url === undefined || targetId === undefined) throw new Error(USAGE);
  if (kind === "heap" && args.length === 3) return { url, targetId, command: { kind } };
  if (kind === "throttle" && args.length === 4 && Number(fourth) >= 1) return { url, targetId, command: { kind, rate: Number(fourth) } };
  if (kind === "open" && fourth !== undefined && fourth.startsWith("http")) return { url, targetId, command: { kind, pageUrl: fourth } };
  throw new Error(USAGE);
}

async function main(args: readonly string[]): Promise<void> {
  const { url, targetId, command } = parse(args);
  const session = await attach(url, targetId);
  switch (command.kind) {
    case "throttle":
      await session.send("Emulation.setCPUThrottlingRate", { rate: command.rate });
      console.log(`throttled the page's CPU ${command.rate}x; it lasts while this process holds the DevTools session`);
      await session.closed;
      throw new Error("the DevTools session closed, so the CPU throttle ended");
    case "heap": {
      await session.send("HeapProfiler.collectGarbage");
      const usage = await session.send("Runtime.getHeapUsage");
      const usedBytes = count(usage, "usedSize");
      const backingBytes = count(usage, "backingStorageSize");
      const noted = await session.send("Runtime.evaluate", { expression: `window.__perfGate.noteHeap(${usedBytes}, ${backingBytes})` });
      if (property(noted, "exceptionDetails") !== undefined) throw new Error("the page has no perf observer to note the heap reading");
      console.log(JSON.stringify({ usedBytes, backingBytes }));
      session.close();
      return;
    }
    case "open": {
      await session.send("Page.enable");
      const gate: { done: boolean; resolve: () => void; reject: (error: Error) => void } = {
        done: false,
        resolve: () => undefined,
        reject: () => undefined,
      };
      const parsed = new Promise<void>((resolve, reject) => {
        gate.resolve = resolve;
        gate.reject = reject;
      });
      const timer = setTimeout(() => {
        if (gate.done) return;
        gate.done = true;
        gate.reject(new Error("the page did not parse within 25s"));
      }, DOCUMENT_PARSE_MS);
      let armed = false;
      session.listen((message) => {
        if (!armed || gate.done || property(message, "method") !== "Page.domContentEventFired") return;
        gate.done = true;
        clearTimeout(timer);
        gate.resolve();
      });
      try {
        armed = true;
        const navigated = await session.send("Page.navigate", { url: command.pageUrl });
        const errorText = property(navigated, "errorText");
        if (!gate.done && typeof errorText === "string" && errorText !== "") {
          gate.done = true;
          clearTimeout(timer);
          gate.reject(new Error(`the page did not open: ${errorText}`));
        }
        await parsed;
      } finally {
        clearTimeout(timer);
        session.close();
      }
      return;
    }
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`devtools: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

export {};
