import { Settings, TrainerInstance, Viewport } from "osrs-sdk";
import { dress } from "../js/OcellusLoadout";
import { OCELLUS_P4, defaultLoadout } from "../js/OcellusTimings";
import { FightRegion } from "../fight/FightRegion";
import type { FullFightOptions } from "../full/prefix";

describe("a melee player targeting the levitating boss", () => {
  test("at 0 hitpoints dies on the next ticks, and the swing is refused", () => {
    Settings.readFromStorage();
    const options: FullFightOptions = {
      seed: 1,
      party: 1,
      startPhase: 3,
      hazardTiles: true,
      videoMarkers: false,
      skipMarkers: false,
      soloVine: true,
      invincible: true,
    };
    const region = new FightRegion(options, (player) => dress(player, defaultLoadout(OCELLUS_P4.choices.setup.options.melee.value)));
    const trainer = new TrainerInstance(region, { force2d: true });
    trainer.mount(document.createElement("canvas"), document.createElement("div"));
    region.world.getReadyTimer = 0;
    Viewport.viewport.resize(800, 600);
    const fight = region.fight;
    if (!fight) throw new Error("the region built no fight");
    const shouts: [number, string][] = [];
    const say = fight.say.bind(fight);
    vi.spyOn(fight, "say").mockImplementation((text: string, ticks?: number) => {
      shouts.push([fight.tick, text]);
      say(text, ticks);
    });
    let untether = -1;
    for (let guard = 0; untether < 0 && guard < 400; guard++) {
      region.world.tickWorld();
      const line = shouts.find(([, text]) => text === "Untether...");
      if (line) untether = line[0];
    }
    const boss = fight.boss;
    if (!boss || untether < 0) throw new Error("Untether did not start");
    const player = fight.player;
    player.setAggro(boss);
    player.attackDelay = 0;
    for (let step = 0; step < 9; step++) region.world.tickWorld();
    const flying = fight.chat.filter((line) => line.text.startsWith("It's flying too high")).map((line) => line.tick);
    player.setAggro(boss);
    fight.practice = false;
    player.currentStats.hitpoint = 0;
    const after: [number, number, number, string][] = [];
    for (let step = 0; step < 3; step++) {
      region.world.tickWorld();
      after.push([fight.tick, player.currentStats.hitpoint, player.dying, fight.outcome.kind]);
    }
    trainer.dispose();
    vi.restoreAllMocks();
    expect({ weapon: player.equipment.weapon?.itemName ?? null, untether, flying, after }).toEqual({
      weapon: "Scythe of Vitur",
      untether: 59,
      flying: [60, 63, 66],
      after: [
        [69, 0, 4, "running"],
        [70, 0, 3, "running"],
        [71, 0, 2, "running"],
      ],
    });
  }, 120000);
});
