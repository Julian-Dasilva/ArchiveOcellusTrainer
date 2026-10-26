import { Settings, TrainerInstance, Viewport } from "osrs-sdk";
import type { FightOptions } from "../fight/Fight";
import type { HandOver } from "../fight/handOver";
import { fullFightStaged } from "../full/prefix";

describe("the hosted prefix", () => {
  test("a seeded run from phase 1 reaches the third fall", () => {
    Settings.readFromStorage();
    const handOvers: { tick: number; state: HandOver }[] = [];
    const options: FightOptions = {
      seed: 1,
      party: 1,
      startPhase: 1,
      hazardTiles: true,
      videoMarkers: false,
      skipMarkers: false,
      soloVine: true,
      invincible: true,
      onHandOver: (state) => handOvers.push({ tick: region.fight?.tick ?? -1, state }),
    };
    const region = fullFightStaged(options, () => undefined);
    const trainer = new TrainerInstance(region, { force2d: true });
    trainer.mount(document.createElement("canvas"), document.createElement("div"));
    region.world.getReadyTimer = 0;
    Viewport.viewport.resize(800, 600);
    const fight = region.fight;
    if (!fight) throw new Error("the region built no fight");
    const labels: string[] = [];
    for (let step = 0; step < 2500 && handOvers.length === 0; step++) {
      region.world.tickWorld();
      const label = fight.label();
      if (label !== "" && labels[labels.length - 1] !== label) labels.push(label);
      const boss = fight.boss;
      if (!boss) continue;
      if (label === "Phase 1" && boss.form === "p1" && boss.currentStats.hitpoint > 0) boss.currentStats.hitpoint = 0;
      if (label === "Phase 3" && boss.currentStats.hitpoint > 0) boss.currentStats.hitpoint = 0;
    }
    const handed = handOvers[0];
    trainer.dispose();
    expect(labels).toEqual(["Phase 1", "Phase 2", "Phase 3"]);
    expect(handOvers).toHaveLength(1);
    expect(fight.destroyed.size).toBe(3);
    if (!handed) throw new Error("phase 3 did not hand over");
    expect(handed.tick).toBe(fight.tick);
  }, 120000);
});
