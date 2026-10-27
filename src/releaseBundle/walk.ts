import { spawnSync } from "node:child_process";

export type WalkSurface = "desktop" | "phone";

export type WalkObservation = Readonly<{
  surface: WalkSurface;
  rootChildren: number;
  errors: readonly string[];
  makerOnScreen: boolean;
  fullFightReachable: boolean;
  worldWidth: number;
  chatBottom: string;
  chatLine: string;
}>;

const FACTS = `(() => {
  const onScreen = (id) => {
    const el = document.getElementById(id);
    if (!el || el.checkVisibility() !== true) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth;
  };
  const world = document.getElementById("world");
  const box = world ? world.getBoundingClientRect() : null;
  const corner = document.getElementById("hud_corner");
  const line = document.querySelector("#game_chat li");
  return {
    rootChildren: document.getElementById("root")?.childElementCount ?? 0,
    makerOnScreen: onScreen("sidebar_maker") || onScreen("maker_credit"),
    fullFightOnScreen: onScreen("full_fight"),
    worldWidth: box ? box.width : 0,
    worldLeft: box ? box.left : 0,
    worldTop: box ? box.top : 0,
    worldRight: box ? box.right : 0,
    worldBottom: box ? box.bottom : 0,
    chatBottom: corner instanceof HTMLElement ? corner.style.bottom : "",
    chatLine: line && line.textContent ? line.textContent : "",
    innerHeight,
  };
})()`;

type PageFacts = Readonly<{
  rootChildren: number;
  makerOnScreen: boolean;
  fullFightOnScreen: boolean;
  worldWidth: number;
  worldLeft: number;
  worldTop: number;
  worldRight: number;
  worldBottom: number;
  chatBottom: string;
  chatLine: string;
  innerHeight: number;
}>;

export function walkProblems(observed: WalkObservation): readonly string[] {
  const problems: string[] = [];
  if (observed.rootChildren < 1) problems.push("the page has no root");
  if (observed.errors.length > 0) problems.push(`page errors: ${observed.errors.join("; ")}`);
  if (!observed.makerOnScreen) problems.push("the maker credit is not on screen");
  if (!observed.fullFightReachable) problems.push("Full fight (beta) is not reachable");
  if (observed.chatLine === "") problems.push("no chat line");
  if (observed.surface === "phone") {
    if (observed.worldWidth < 300) problems.push(`the game is ${observed.worldWidth}px wide`);
    if (observed.chatBottom !== "4px") problems.push(`the chat corner is ${observed.chatBottom === "" ? "missing" : observed.chatBottom}, not under the tabs`);
  }
  return problems;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(value)) record[key] = Object.getOwnPropertyDescriptor(value, key)?.value;
  return record;
}

function sessionName(): string {
  const name = process.env.AGENT_BROWSER_SESSION;
  if (name === undefined || name === "") throw new Error("AGENT_BROWSER_SESSION is unset");
  return name;
}

function agent(args: readonly string[]): string {
  const result = spawnSync("agent-browser", ["--session", sessionName(), ...args], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(detail === "" ? `agent-browser ${args.join(" ")} failed` : detail);
  }
  return result.stdout;
}

function numberField(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`page facts ${key} is not a number`);
  return value;
}

function booleanField(record: Readonly<Record<string, unknown>>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw new Error(`page facts ${key} is not a boolean`);
  return value;
}

function stringField(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`page facts ${key} is not a string`);
  return value;
}

function parseFacts(value: unknown): PageFacts {
  const record = asRecord(value);
  if (record === null) throw new Error("page facts are not an object");
  return {
    rootChildren: numberField(record, "rootChildren"),
    makerOnScreen: booleanField(record, "makerOnScreen"),
    fullFightOnScreen: booleanField(record, "fullFightOnScreen"),
    worldWidth: numberField(record, "worldWidth"),
    worldLeft: numberField(record, "worldLeft"),
    worldTop: numberField(record, "worldTop"),
    worldRight: numberField(record, "worldRight"),
    worldBottom: numberField(record, "worldBottom"),
    chatBottom: stringField(record, "chatBottom"),
    chatLine: stringField(record, "chatLine"),
    innerHeight: numberField(record, "innerHeight"),
  };
}

function readFacts(): PageFacts {
  const raw: unknown = JSON.parse(agent(["--json", "eval", FACTS]));
  const top = asRecord(raw);
  const data = top === null ? null : asRecord(top.data);
  const payload = data === null ? undefined : data.result;
  const parsed: unknown = typeof payload === "string" ? JSON.parse(payload) : payload;
  return parseFacts(parsed);
}

function readErrors(): readonly string[] {
  const raw: unknown = JSON.parse(agent(["--json", "errors"]));
  const top = asRecord(raw);
  const data = top === null ? null : asRecord(top.data);
  const errors = data === null ? undefined : data.errors;
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function shot(name: string): void {
  const dir = process.env.RELEASE_SHOTS;
  if (dir === undefined || dir === "") return;
  agent(["screenshot", `${dir}/${name}.png`]);
}

function scrollPanel(edge: "top" | "bottom"): void {
  const target = edge === "top" ? "0" : "panel.scrollHeight";
  agent(["eval", `(() => { const panel = document.getElementById("right_panel"); if (panel) panel.scrollTop = ${target}; })()`]);
}

function clickAt(x: number, y: number): void {
  const px = String(Math.round(x));
  const py = String(Math.round(y));
  agent(["mouse", "move", px, py]);
  agent(["mouse", "down", "left"]);
  agent(["mouse", "up", "left"]);
}

function prayerTab(surface: WalkSurface, facts: PageFacts): Readonly<{ x: number; y: number }> {
  const height = facts.worldBottom - facts.worldTop;
  const width = facts.worldRight - facts.worldLeft;
  const ratio = (height - 180) / (7 * 36);
  const scale = Math.min(1, ratio);
  if (surface === "phone") {
    const mapScale = facts.innerHeight >= 500 ? 1 : facts.innerHeight / 500;
    const mapHeight = 170 * mapScale;
    const spacer = (height - mapHeight - 36 * scale * 7) / 2;
    return {
      x: facts.worldLeft + 15 + (33 * scale) / 2,
      y: facts.worldTop + mapHeight + spacer + 36 * scale + (36 * scale) / 2,
    };
  }
  return {
    x: facts.worldLeft + width - 231 * scale + 5 * 33 * scale + (33 * scale) / 2,
    y: facts.worldTop + height - 72 * scale + (36 * scale) / 2,
  };
}

function closeBrowser(): void {
  spawnSync("agent-browser", ["--session", sessionName(), "close"], { encoding: "utf8" });
}

function visible(id: string): boolean {
  const raw: unknown = JSON.parse(agent(["--json", "eval", `document.getElementById(${JSON.stringify(id)})?.checkVisibility() === true`]));
  const top = asRecord(raw);
  const data = top === null ? null : asRecord(top.data);
  return data?.result === true;
}

function phaseSelector(origin: string): readonly string[] {
  agent(["open", `${origin}/?mode=full&seed=1&invincible=on`]);
  agent(["wait", "--fn", "document.getElementById('phone_menu') !== null && document.getElementById('start_phase') !== null", "--timeout", "120000"]);
  agent(["click", "#phone_menu"]);
  agent(["eval", "document.getElementById('start_phase')?.scrollIntoView({ block: 'center' })"]);
  shot("phone-phase");
  return visible("start_phase") ? [] : ["the phase selector is not reachable"];
}

function openSurface(surface: WalkSurface, origin: string): void {
  if (surface === "desktop") agent(["set", "viewport", "1280", "800"]);
  else agent(["set", "device", "iPhone 12"]);
  agent(["open", `${origin}/?seed=1&invincible=on`]);
  agent(["wait", "--fn", "document.getElementById('sidebar_maker') !== null && document.getElementById('start')?.checkVisibility() === true", "--timeout", "120000"]);
}

function driveSurface(surface: WalkSurface, origin: string): readonly string[] {
  process.env.AGENT_BROWSER_SESSION = `release-${surface}-${process.pid}`;
  try {
    openSurface(surface, origin);
    scrollPanel("top");
    shot(surface === "desktop" ? "desktop-1280x800-top" : "phone-closed");
    const loaded = readFacts();
    let fullFightReachable = loaded.fullFightOnScreen;
    let worldWidth = loaded.worldWidth;
    if (surface === "phone") {
      agent(["click", "#phone_menu"]);
      agent(["wait", "--fn", "document.getElementById('full_fight')?.checkVisibility() === true", "--timeout", "10000"]);
      shot("phone-open");
      const opened = readFacts();
      fullFightReachable = opened.fullFightOnScreen;
      worldWidth = Math.min(worldWidth, opened.worldWidth);
      scrollPanel("bottom");
      shot("phone-open-bottom");
      agent(["click", "#phone_menu"]);
    } else {
      scrollPanel("bottom");
      shot("desktop-1280x800-bottom");
      agent(["set", "viewport", "1280", "600"]);
      agent(["wait", "300"]);
      scrollPanel("top");
      shot("desktop-1280x600-top");
      scrollPanel("bottom");
      shot("desktop-1280x600-bottom");
      agent(["set", "viewport", "1280", "800"]);
    }
    agent(["click", "#start"]);
    agent(["wait", "800"]);
    const playing = readFacts();
    clickAt(prayerTab(surface, playing).x, prayerTab(surface, playing).y);
    agent(["wait", "--fn", "!!document.querySelector('#game_chat li')?.textContent", "--timeout", "90000"]);
    const settled = readFacts();
    shot(`${surface}-chat`);
    const problems = walkProblems({
      surface,
      rootChildren: settled.rootChildren,
      errors: readErrors(),
      makerOnScreen: loaded.makerOnScreen,
      fullFightReachable,
      worldWidth,
      chatBottom: settled.chatBottom,
      chatLine: settled.chatLine,
    });
    return surface === "phone" ? [...problems, ...phaseSelector(origin)] : problems;
  } finally {
    closeBrowser();
  }
}

function main(origin: string): void {
  const problems = [...driveSurface("desktop", origin), ...driveSurface("phone", origin)];
  for (const problem of problems) console.error(`release-browser: ${problem}`);
  if (problems.length > 0) process.exitCode = 1;
  else console.log("release-browser: desktop and phone passed");
}

if (process.env.RELEASE_BROWSER === "1") {
  const origin = process.argv[2];
  if (origin === undefined) throw new Error("usage: walk.ts <origin>");
  main(origin);
}
