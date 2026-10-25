import { Settings, TrainerInstance, Viewport } from "osrs-sdk";
import type { Mob, Player } from "osrs-sdk";
import type { P2Event, P2Row } from "../js/P2Types";
import type { At } from "./drill";
import { clickTile } from "./drill";

export type P2DrillOptions = Readonly<{ seed?: number; bossHp?: number; markers?: string; invincible?: boolean }>;
type ProtectionPrayer = "Protect from Magic" | "Protect from Range" | "Protect from Melee";

/** Tiles of the phase 3 grid by their offset from the middle at (15, 13): east is +x, north is -y. */
export const fromMiddle = (east: number, north: number): At => ({ x: 15 + east, y: 13 - north });

export async function startP2Drill(options: P2DrillOptions = {}) {
  const { P2Region } = await vi.importActual<typeof import("../js/P2Region")>("../js/P2Region");
  const { parseRequest } = await vi.importActual<typeof import("../js/OcellusTimings")>("../js/OcellusTimings");
  Settings.readFromStorage();
  const link = new URL("http://localhost/?phase=p2");
  link.searchParams.set("seed", String(options.seed ?? 1));
  if (options.bossHp !== undefined) link.searchParams.set("bosshp", String(options.bossHp));
  if (options.markers !== undefined) link.searchParams.set("markers", options.markers);
  const request = parseRequest(link, () => {
    throw new Error(`the drill link has no usable seed: ${link.search}`);
  }, { p3: false, p2: true });
  if (request.phase !== "p2") throw new Error(`the drill link opened ${request.phase}: ${link.search}`);
  if (request.rejected.length > 0) throw new Error(`the drill link has options the trainer rejects: ${request.rejected.join(", ")}`);
  const region = new P2Region(request.config);
  region.invincible = options.invincible ?? false;
  const trainer = new TrainerInstance(region, { force2d: true });
  trainer.mount(document.createElement("canvas"), document.createElement("div"));
  region.world.tickWorld(region.world.getReadyTimer - 1);
  Viewport.viewport.resize(800, 800);

  const rows = (): readonly P2Row[] => region.fightLog().rows;
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
  const events = <K extends P2Event["kind"]>(kind: K) =>
    rows()
      .flatMap((row) => row.events)
      .filter((event): event is Extract<P2Event, { kind: K }> => event.kind === kind);

  return {
    region,
    rows,
    player,
    boss,
    tickTo(t: number) {
      for (let guard = 0; !ended() && lastTick() < t; guard++) {
        if (guard > t + 20) throw new Error(`the boss never reached P2 tick ${t}`);
        region.world.tickWorld();
      }
    },
    row(t: number): P2Row {
      const found = rows().find((row) => row.tick === t);
      if (!found) throw new Error(`no row for P2 tick ${t}`);
      return found;
    },
    events,
    /** The first event of a kind, which the drill's seed and choices make certain to come. */
    first<K extends P2Event["kind"]>(kind: K): Extract<P2Event, { kind: K }> {
      const [found] = events(kind);
      if (found === undefined) throw new Error(`no ${kind} event by P2 tick ${lastTick()}`);
      return found;
    },
    click: (on: At) => clickTile(region.world, on),
    tile: (): At => ({ x: player().location.x, y: player().location.y }),
    pray: (name: ProtectionPrayer) => player().prayerController.findPrayerByName(name).toggle(player()),
    dispose() {
      trainer.dispose();
    },
  };
}
