import { Settings, TrainerInstance, Viewport } from "osrs-sdk";
import type { Mob, Player } from "osrs-sdk";
import type { P1Event, P1Row } from "../js/P1Types";
import type { At } from "./drill";
import { clickTile } from "./drill";

export type P1DrillOptions = Readonly<{ seed?: number; bossHp?: number; setup?: string; invincible?: boolean }>;
const CLIENT_FRAMES_PER_TICK = 30;
const CLIENT_FRAME_MS = 20;

type ProtectionPrayer = "Protect from Magic" | "Protect from Range" | "Protect from Melee";

export async function startP1Drill(options: P1DrillOptions = {}) {
  const { P1Region } = await vi.importActual<typeof import("../js/P1Region")>("../js/P1Region");
  const { parseRequest } = await vi.importActual<typeof import("../js/OcellusTimings")>("../js/OcellusTimings");
  Settings.readFromStorage();
  const link = new URL("http://localhost/?phase=p1");
  link.searchParams.set("seed", String(options.seed ?? 1));
  if (options.bossHp !== undefined) link.searchParams.set("bosshp", String(options.bossHp));
  if (options.setup !== undefined) link.searchParams.set("setup", options.setup);
  const request = parseRequest(link, () => {
    throw new Error(`the drill link has no usable seed: ${link.search}`);
  }, { p3: false, p2: false, p1: true, full: false });
  if (request.phase !== "p1") throw new Error(`the drill link opened ${request.phase}: ${link.search}`);
  if (request.rejected.length > 0) throw new Error(`the drill link has options the trainer rejects: ${request.rejected.join(", ")}`);
  const region = new P1Region(request.config);
  region.invincible = options.invincible ?? false;
  const trainer = new TrainerInstance(region);
  trainer.mount(document.createElement("canvas"), document.createElement("div"));
  region.world.tickWorld(region.world.getReadyTimer - 1);
  Viewport.viewport.resize(800, 800);

  const rows = (): readonly P1Row[] => region.fightLog().rows;
  const player = (): Player => region.players[0];
  const boss = (): Mob => {
    if (!region.primaryBoss) throw new Error("the region has no boss");
    return region.primaryBoss;
  };
  const ended = () => region.snapshot()?.run.kind === "ended";
  const lastTick = () => {
    const all = rows();
    return all.length === 0 ? -1 : all[all.length - 1].tick;
  };
  let clock = 0;
  /** A tick's 30 client frames, which walk units along their visual paths so a click finds the boss where he stands. */
  const frames = () => {
    for (let frame = 0; frame < CLIENT_FRAMES_PER_TICK; frame++) region.world.clientTick(region, (frame + 1) / CLIENT_FRAMES_PER_TICK, (clock += CLIENT_FRAME_MS));
  };
  const events = <K extends P1Event["kind"]>(kind: K) =>
    rows()
      .flatMap((row) => row.events)
      .filter((event): event is Extract<P1Event, { kind: K }> => event.kind === kind);

  return {
    region,
    rows,
    player,
    boss,
    events,
    /** Ticks the world until the boss has played P1 tick `t`, calling `each` after every new row. */
    tickTo(t: number, each: (row: P1Row) => void = () => undefined) {
      for (let guard = 0; !ended() && lastTick() < t; guard++) {
        if (guard > t + 20) throw new Error(`the boss never reached P1 tick ${t}`);
        const before = lastTick();
        region.world.tickWorld();
        frames();
        const all = rows();
        if (lastTick() !== before) each(all[all.length - 1]);
      }
    },
    row(t: number): P1Row {
      const found = rows().find((row) => row.tick === t);
      if (!found) throw new Error(`no row for P1 tick ${t}`);
      return found;
    },
    click: (on: At) => clickTile(region.world, on),
    walkTo: (to: At) => player().moveTo(to.x, to.y),
    pray: (name: ProtectionPrayer) => player().prayerController.findPrayerByName(name).toggle(player()),
    dispose() {
      trainer.dispose();
    },
  };
}
