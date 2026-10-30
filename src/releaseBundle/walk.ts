import { spawnSync } from "node:child_process";
import { creditLines } from "../menu/credits";

export function visibleCreditLines(doc: Document): readonly string[] {
  const view = doc.defaultView;
  if (view === null) return [];
  const lines: string[] = [];
  for (const node of doc.querySelectorAll("#policy_footer li")) {
    if (!(node instanceof HTMLElement)) continue;
    const text = node.textContent;
    if (text === null || node.checkVisibility() !== true) continue;
    const box = node.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < view.innerHeight && box.left < view.innerWidth)) continue;
    const x = Math.min(Math.max(box.left + box.width / 2, 0), view.innerWidth - 1);
    const y = Math.min(Math.max(box.top + box.height / 2, 0), view.innerHeight - 1);
    const top = doc.elementFromPoint(x, y);
    if (top === null || (top !== node && !node.contains(top))) continue;
    lines.push(text.replace(/\s+/g, " ").trim());
  }
  return lines;
}

export type WalkSurface = "desktop" | "phone";

/** The buttons that left for the retired drill page or into the full fight from it. */
const RETIRED_TOGGLES = ["Full fight (beta)", "Phase 4 drill"] as const;

export type WalkObservation = Readonly<{
  surface: WalkSurface;
  rootChildren: number;
  errors: readonly string[];
  creditLines: readonly string[];
  startPhase: string;
  phases: readonly string[];
  sections: readonly string[];
  aboutReachable: boolean;
  retiredToggles: readonly string[];
  loadoutButton: boolean;
  tierPicker: boolean;
  startWith: readonly string[];
  startWeapon: string;
  worldWidth: number;
  chatBottom: string;
  chatLine: string;
  keybindsClosed: boolean;
}>;

const FACTS = `(() => {
  const visibleCreditLines = ${visibleCreditLines.toString()};
  const onScreen = (el) => {
    if (!el || el.checkVisibility() !== true) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth;
  };
  const creditLines = visibleCreditLines(document);
  const world = document.getElementById("world");
  const box = world ? world.getBoundingClientRect() : null;
  const corner = document.getElementById("hud_corner");
  const line = document.querySelector("#game_chat li");
  const menu = document.getElementById("phone_menu");
  const panel = document.getElementById("right_panel");
  const start = document.getElementById("start_phase");
  const weapon = document.getElementById("start_weapon");
  return {
    rootChildren: document.getElementById("root")?.childElementCount ?? 0,
    creditLines,
    startPhase: start instanceof HTMLSelectElement ? start.value : "",
    phases: start instanceof HTMLSelectElement ? [...start.options].map((option) => option.value) : [],
    sections: [...document.querySelectorAll("#sidebar > section > .sidebar_title")].map((title) => title.textContent || ""),
    aboutReachable: onScreen(document.getElementById("perf_data")) && onScreen(document.getElementById("whats_new")),
    retiredToggles: [...document.querySelectorAll("button, a")].map((el) => (el.textContent || "").trim()).filter((text) => ${JSON.stringify(RETIRED_TOGGLES)}.includes(text)),
    loadoutButton: document.getElementById("loadout") !== null,
    tierPicker: document.getElementById("start_tier") !== null,
    startWith: weapon instanceof HTMLSelectElement ? [...weapon.options].map((option) => option.text) : [],
    startWeapon: weapon instanceof HTMLSelectElement ? weapon.selectedOptions[0]?.text ?? "" : "",
    worldWidth: box ? box.width : 0,
    worldLeft: box ? box.left : 0,
    worldTop: box ? box.top : 0,
    worldRight: box ? box.right : 0,
    worldBottom: box ? box.bottom : 0,
    chatBottom: corner instanceof HTMLElement ? corner.style.bottom : "",
    chatLine: line && line.textContent ? line.textContent : "",
    keybindsClosed: menu !== null && menu.textContent === "Menu" && menu.getAttribute("aria-expanded") === "false" && panel instanceof HTMLElement && (panel.style.display === "none" || panel.checkVisibility() !== true),
    innerHeight,
  };
})()`;

type PageFacts = Readonly<{
  rootChildren: number;
  creditLines: readonly string[];
  startPhase: string;
  phases: readonly string[];
  sections: readonly string[];
  aboutReachable: boolean;
  retiredToggles: readonly string[];
  loadoutButton: boolean;
  tierPicker: boolean;
  startWith: readonly string[];
  startWeapon: string;
  worldWidth: number;
  worldLeft: number;
  worldTop: number;
  worldRight: number;
  worldBottom: number;
  chatBottom: string;
  chatLine: string;
  keybindsClosed: boolean;
  innerHeight: number;
}>;

function missingCredits(lines: readonly string[]): readonly string[] {
  return creditLines().flatMap((line) => (lines.includes(line) ? [] : [`${line} is not on screen`]));
}

const SECTIONS = ["Fight", "Learning aids", "Display", "Sound", "Controls", "About"] as const;

/** The Start with of 2026.10.28, the live release, which the release must keep while the gear tiers are held out. */
const RELEASE_START_WITH = ["Twisted bow (Masori)", "Toxic blowpipe (Masori)", "Scythe (Inquisitor's)"] as const;
const RELEASE_START_WEAPON = RELEASE_START_WITH[0];

type StartWith = Readonly<{ startWith: readonly string[]; startWeapon: string }>;

function startWithProblems({ startWith, startWeapon }: StartWith): readonly string[] {
  const problems: string[] = [];
  if (startWith.join(",") !== RELEASE_START_WITH.join(",")) problems.push(`Start with offers ${startWith.join(", ") || "nothing"}, not ${RELEASE_START_WITH.join(", ")}`);
  if (startWeapon !== RELEASE_START_WEAPON) problems.push(`Start with is ${startWeapon || "nothing"}, not ${RELEASE_START_WEAPON}`);
  return problems;
}

export function walkProblems(observed: WalkObservation): readonly string[] {
  const problems: string[] = [];
  if (observed.rootChildren < 1) problems.push("the page has no root");
  if (observed.errors.length > 0) problems.push(`page errors: ${observed.errors.join("; ")}`);
  problems.push(...missingCredits(observed.creditLines));
  if (observed.startPhase !== "4") problems.push(`Start at is ${observed.startPhase === "" ? "missing" : `phase ${observed.startPhase}`}, not phase 4`);
  if (observed.phases.join(",") !== "1,2,3,4") problems.push(`Start at offers ${observed.phases.join(", ") || "nothing"}, not phases 1 to 4`);
  if (observed.sections.join(",") !== SECTIONS.join(",")) problems.push(`the panel's sections are ${observed.sections.join(", ")}, not ${SECTIONS.join(", ")}`);
  if (!observed.aboutReachable) problems.push("Performance data and What's new are not reachable at the bottom of the panel");
  problems.push(...observed.retiredToggles.map((toggle) => `${toggle} is still on the page`));
  if (observed.loadoutButton) problems.push("the Loadout button is on the release page");
  if (observed.tierPicker) problems.push("the Tier picker is on the release page");
  problems.push(...startWithProblems(observed));
  if (observed.chatLine === "") problems.push("no chat line");
  if (observed.surface === "phone") {
    if (observed.worldWidth < 300) problems.push(`the game is ${observed.worldWidth}px wide`);
    if (observed.chatBottom !== "4px") problems.push(`the chat corner is ${observed.chatBottom === "" ? "missing" : observed.chatBottom}, not under the tabs`);
    if (!observed.keybindsClosed) problems.push("Keybinds leaves the menu open");
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

function stringListField(record: Readonly<Record<string, unknown>>, key: string): readonly string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`page facts ${key} is not a string list`);
  return value.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function parseFacts(value: unknown): PageFacts {
  const record = asRecord(value);
  if (record === null) throw new Error("page facts are not an object");
  return {
    rootChildren: numberField(record, "rootChildren"),
    creditLines: stringListField(record, "creditLines"),
    startPhase: stringField(record, "startPhase"),
    phases: stringListField(record, "phases"),
    sections: stringListField(record, "sections"),
    aboutReachable: booleanField(record, "aboutReachable"),
    retiredToggles: stringListField(record, "retiredToggles"),
    loadoutButton: booleanField(record, "loadoutButton"),
    tierPicker: booleanField(record, "tierPicker"),
    startWith: stringListField(record, "startWith"),
    startWeapon: stringField(record, "startWeapon"),
    worldWidth: numberField(record, "worldWidth"),
    worldLeft: numberField(record, "worldLeft"),
    worldTop: numberField(record, "worldTop"),
    worldRight: numberField(record, "worldRight"),
    worldBottom: numberField(record, "worldBottom"),
    chatBottom: stringField(record, "chatBottom"),
    chatLine: stringField(record, "chatLine"),
    keybindsClosed: booleanField(record, "keybindsClosed"),
    innerHeight: numberField(record, "innerHeight"),
  };
}

function readEvalPayload(rawText: string): unknown {
  const raw: unknown = JSON.parse(rawText);
  const top = asRecord(raw);
  const data = top === null ? null : asRecord(top.data);
  const payload = data === null ? undefined : data.result;
  return typeof payload === "string" ? JSON.parse(payload) : payload;
}

function readEval(script: string): unknown {
  return readEvalPayload(agent(["--json", "eval", script]));
}

function readFacts(): PageFacts {
  return parseFacts(readEval(FACTS));
}

function errorTexts(raw: unknown): readonly string[] {
  const top = asRecord(raw);
  const data = top === null ? null : asRecord(top.data);
  const errors = data === null ? undefined : data.errors;
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function readErrors(): readonly string[] {
  return errorTexts(JSON.parse(agent(["--json", "errors"])));
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
  // The next surface needs a new browser. Leaving the daemon's browser up stops the following page load.
  spawnSync("agent-browser", ["--session", sessionName(), "close", "--all"], { encoding: "utf8" });
}

function openSurface(surface: WalkSurface, origin: string): void {
  if (surface === "desktop") agent(["set", "viewport", "1280", "800"]);
  else agent(["set", "device", "iPhone 12"]);
  agent(["open", `${origin}/`]);
  const maker = JSON.stringify(creditLines()[0] ?? "");
  agent(["wait", "--fn", `(() => { const lines = [...document.querySelectorAll('#policy_footer li')].map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim()); return lines.includes(${maker}) && document.getElementById('start')?.checkVisibility() === true; })()`, "--timeout", "120000"]);
}

function driveSurface(surface: WalkSurface, origin: string): readonly string[] {
  process.env.AGENT_BROWSER_SESSION = `release-${surface}-${process.pid}`;
  try {
    openSurface(surface, origin);
    scrollPanel("top");
    shot(surface === "desktop" ? "desktop-1280x800-top" : "phone-closed");
    const loaded = readFacts();
    let bottom = loaded;
    let worldWidth = loaded.worldWidth;
    let keybindsClosed = true;
    if (surface === "phone") {
      agent(["click", "#phone_menu"]);
      agent(["wait", "--fn", "document.getElementById('start_phase')?.checkVisibility() === true", "--timeout", "10000"]);
      shot("phone-open");
      worldWidth = Math.min(worldWidth, readFacts().worldWidth);
      scrollPanel("bottom");
      shot("phone-open-bottom");
      bottom = readFacts();
      agent(["click", "#keybinds"]);
      agent(["wait", "--fn", "document.getElementById('phone_menu')?.textContent === 'Menu'", "--timeout", "10000"]);
      shot("phone-keybinds");
      keybindsClosed = readFacts().keybindsClosed;
    } else {
      scrollPanel("bottom");
      shot("desktop-1280x800-bottom");
      bottom = readFacts();
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
      creditLines: loaded.creditLines,
      startPhase: loaded.startPhase,
      phases: loaded.phases,
      sections: loaded.sections,
      aboutReachable: bottom.aboutReachable,
      retiredToggles: loaded.retiredToggles,
      loadoutButton: loaded.loadoutButton,
      tierPicker: loaded.tierPicker,
      startWith: loaded.startWith,
      startWeapon: loaded.startWeapon,
      worldWidth,
      chatBottom: settled.chatBottom,
      chatLine: settled.chatLine,
      keybindsClosed,
    });
    return problems;
  } finally {
    closeBrowser();
  }
}

/** Links from before the drill was retired, which land in the full fight at phase 4, and tier links, which start on the default gear. */
const OLD_LINKS = ["?mode=full", "?mode=full&phase=1", "?seed=1&invincible=on", "?seed=4&bosshp=1&focus=void-floor&drillStart=cycle-start", "?phase=p3&seed=1", "?tier=max", "?seed=1&tier=max&weapon=ralos"] as const;

export function oldLinkProblems(link: string, observed: StartWith & Readonly<{ startPhase: string; errors: readonly string[] }>): readonly string[] {
  const want = new URLSearchParams(link).get("phase") === "1" ? "1" : "4";
  const problems: string[] = [];
  if (observed.startPhase !== want) problems.push(`${link} opens Start at ${observed.startPhase === "" ? "nothing" : `phase ${observed.startPhase}`}, not phase ${want}`);
  problems.push(...startWithProblems(observed).map((problem) => `${link} ${problem}`));
  if (observed.errors.length > 0) problems.push(`${link} page errors: ${observed.errors.join("; ")}`);
  return problems;
}

function driveOldLinks(origin: string): readonly string[] {
  process.env.AGENT_BROWSER_SESSION = `release-links-${process.pid}`;
  try {
    agent(["set", "viewport", "1280", "800"]);
    return OLD_LINKS.flatMap((link) => {
      agent(["open", `${origin}/${link}`]);
      agent(["wait", "--fn", "document.getElementById('start')?.checkVisibility() === true", "--timeout", "120000"]);
      const { startPhase, startWith, startWeapon } = readFacts();
      return oldLinkProblems(link, { startPhase, startWith, startWeapon, errors: readErrors() });
    });
  } finally {
    closeBrowser();
  }
}

function main(origin: string): void {
  const problems = [...driveSurface("desktop", origin), ...driveSurface("phone", origin), ...driveOldLinks(origin)];
  for (const problem of problems) console.error(`release-browser: ${problem}`);
  if (problems.length > 0) process.exitCode = 1;
  else console.log("release-browser: desktop, phone and the old links passed");
}

if (process.env.RELEASE_BROWSER === "1") {
  const origin = process.argv[2];
  if (origin === undefined) throw new Error("usage: walk.ts <origin>");
  try {
    main(origin);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "the release walk failed";
    console.error(`release-browser: ${message}`);
    process.exitCode = 1;
  }
}
