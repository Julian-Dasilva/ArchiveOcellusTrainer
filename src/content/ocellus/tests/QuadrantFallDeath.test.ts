import { Settings, TrainerInstance, Viewport } from "osrs-sdk";
import { P3 } from "../full/data/p3";
import type { Fight, FightOptions } from "../fight/Fight";
import { FightRegion } from "../fight/FightRegion";
import type { ATile, Quadrant } from "../fight/geometry";
import { QUADRANTS, quadrantOf, quadrantTiles } from "../fight/geometry";
import type { HandOver } from "../fight/handOver";

/**
 * The quadrant falls 13 ticks after it starts to collapse, and the collapse starts the tick after his HP is at the
 * floor. Landing is tick 6, so a floor set just after landing falls on tick 20.
 */
const FALL_TICK = 20;
const DEATH_SCREEN_TICK = 24;

describe("a falling quadrant", () => {
  let close: (() => void) | null = null;
  afterEach(() => {
    close?.();
    close = null;
  });

  function open(practice: boolean) {
    Settings.readFromStorage();
    const handOvers: HandOver[] = [];
    const options: FightOptions = {
      seed: 1,
      party: 1,
      startPhase: 3,
      hazardTiles: false,
      videoMarkers: false,
      skipMarkers: false,
      soloVine: true,
      invincible: practice,
      onHandOver: (state) => handOvers.push(state),
    };
    const region = new FightRegion(options, () => undefined);
    const trainer = new TrainerInstance(region, { force2d: true });
    trainer.mount(document.createElement("canvas"), document.createElement("div"));
    region.world.getReadyTimer = 0;
    Viewport.viewport.resize(800, 600);
    const fight = region.fight;
    if (!fight) throw new Error("the region built no fight");
    close = () => trainer.dispose();
    const tick = () => region.world.tickWorld();
    const tickTo = (n: number) => {
      let guard = 0;
      while (fight.tick < n) {
        tick();
        if (++guard > 400) throw new Error(`the fight stuck at tick ${fight.tick}, outcome ${fight.outcome.kind}`);
      }
    };
    return { fight, tick, tickTo, handOvers };
  }

  /** His HP at a whole-number percentage, set between ticks so the next tick can start the collapse. */
  function floorBoss(fight: Fight, shown = 75): void {
    const boss = fight.boss;
    if (!boss) throw new Error("phase 3 has no boss");
    boss.currentStats.hitpoint = Math.ceil((fight.poolMax * shown) / 100);
  }

  function standOn(fight: Fight, quadrant: Quadrant): ATile {
    const tile = quadrantTiles(quadrant).find((t) => fight.isWalkable(t));
    if (!tile) throw new Error(`no floor in ${quadrant}`);
    fight.player.hop(tile);
    return tile;
  }

  function otherThan(fight: Fight, here: Quadrant | null): Quadrant {
    const next = QUADRANTS.find((q) => q !== here && !fight.destroyed.has(q));
    if (!next) throw new Error("no standing quadrant");
    return next;
  }

  function consumed(fight: Fight): readonly (readonly [number, string])[] {
    return fight.chat.filter((line) => line.text === "The void consumes you." || line.text === "Oh dear, you are dead!").map((line) => [line.tick, line.text]);
  }

  function playerState(fight: Fight): readonly [number, number, Fight["outcome"]["kind"]] {
    return [fight.player.currentStats.hitpoint, fight.player.dying, fight.outcome.kind];
  }

  function killed(practice: boolean): void {
    const { fight, tickTo, handOvers } = open(practice);
    tickTo(P3.jumpToCornerAfter);
    const home = quadrantOf(fight.playerTile);
    if (!home) throw new Error("the player is not in a quadrant");
    floorBoss(fight);
    tickTo(FALL_TICK);
    expect({ tick: fight.tick, home, state: playerState(fight), chat: consumed(fight), handedOver: handOvers.length }).toEqual({
      tick: FALL_TICK,
      home,
      state: [0, 4, "running"],
      chat: [[FALL_TICK, "The void consumes you."]],
      handedOver: 0,
    });
    tickTo(DEATH_SCREEN_TICK);
    expect({
      tick: fight.tick,
      state: playerState(fight),
      outcome: fight.outcome,
      chat: consumed(fight),
      handedOver: handOvers.length,
      crumbling: [...fight.floorState().crumbling],
      fell: [...fight.destroyed],
      hidden: fight.boss?.hidden === true,
      collapses: fight.chat.filter((line) => line.text === "The quadrant begins to collapse! Jump across the stones!").length,
    }).toEqual({
      tick: DEATH_SCREEN_TICK,
      state: [0, 0, "lost"],
      outcome: { kind: "lost", ticks: DEATH_SCREEN_TICK, cause: "death" },
      chat: [
        [FALL_TICK, "The void consumes you."],
        [DEATH_SCREEN_TICK, "Oh dear, you are dead!"],
      ],
      handedOver: 0,
      crumbling: [],
      fell: [home],
      hidden: true,
      collapses: 1,
    });
  }

  test("standing on the quadrant at the fall tick kills the player with practice on", () => {
    killed(true);
  });

  test("standing on the quadrant at the fall tick kills the player with practice off", () => {
    killed(false);
  });

  test("guard: standing on a quadrant that is still there leaves the player alive", () => {
    const { fight, tickTo, handOvers } = open(false);
    tickTo(P3.jumpToCornerAfter);
    const home = quadrantOf(fight.playerTile);
    const safe = standOn(fight, otherThan(fight, home));
    floorBoss(fight);
    tickTo(FALL_TICK);
    expect({
      tick: fight.tick,
      tile: fight.playerTile,
      state: playerState(fight),
      chat: consumed(fight),
      handedOver: handOvers.length,
      fell: [...fight.destroyed],
    }).toEqual({
      tick: FALL_TICK,
      tile: safe,
      state: [99, -1, "running"],
      chat: [],
      handedOver: 0,
      fell: home ? [home] : [],
    });
    tickTo(DEATH_SCREEN_TICK);
    expect(playerState(fight)).toEqual([99, -1, "running"]);
  });

  test("guard: leaving on the tick before the fall leaves the player alive", () => {
    const { fight, tickTo, handOvers } = open(false);
    tickTo(P3.jumpToCornerAfter);
    const home = quadrantOf(fight.playerTile);
    if (!home) throw new Error("the player is not in a quadrant");
    floorBoss(fight);
    tickTo(FALL_TICK - 1);
    const safe = standOn(fight, otherThan(fight, home));
    tickTo(FALL_TICK);
    expect({
      tick: fight.tick,
      tile: fight.playerTile,
      state: playerState(fight),
      chat: consumed(fight),
      handedOver: handOvers.length,
      fell: [...fight.destroyed],
    }).toEqual({
      tick: FALL_TICK,
      tile: safe,
      state: [99, -1, "running"],
      chat: [],
      handedOver: 0,
      fell: [home],
    });
  });

  test.each([true, false])("standing on the third quadrant when it falls kills the player and does not start phase 4, practice %s", (practice) => {
    const { fight, tick, tickTo, handOvers } = open(practice);
    tickTo(P3.jumpToCornerAfter);
    const untilFallen = (count: number) => {
      let guard = 0;
      while (fight.destroyed.size < count) {
        tick();
        if (++guard > 80) throw new Error(`quadrant ${count} never fell, tick ${fight.tick}`);
      }
    };
    const untilBossReturns = () => {
      let guard = 0;
      while (fight.boss?.hidden) {
        tick();
        if (++guard > 30) throw new Error(`the boss stayed hidden at tick ${fight.tick}`);
      }
    };
    for (const [shown, count] of [
      [75, 1],
      [50, 2],
    ] as const) {
      untilBossReturns();
      floorBoss(fight, shown);
      const here = quadrantOf(fight.playerTile);
      standOn(fight, otherThan(fight, here));
      untilFallen(count);
    }
    untilBossReturns();
    floorBoss(fight, 25);
    const home = quadrantOf(fight.playerTile);
    if (!home) throw new Error("the player left the last quadrant");
    untilFallen(3);
    const fallTick = fight.tick;
    expect({ home, state: playerState(fight), chat: consumed(fight), handedOver: handOvers.length }).toEqual({
      home,
      state: [0, 4, "running"],
      chat: [[fallTick, "The void consumes you."]],
      handedOver: 0,
    });
    tickTo(fallTick + 4);
    expect({
      outcome: fight.outcome,
      handedOver: handOvers.length,
      crumbling: [...fight.floorState().crumbling],
      fell: fight.destroyed.size,
      hidden: fight.boss?.hidden === true,
      collapses: fight.chat.filter((line) => line.text === "The quadrant begins to collapse! Jump across the stones!").length,
    }).toEqual({
      outcome: { kind: "lost", ticks: fallTick + 4, cause: "death" },
      handedOver: 0,
      crumbling: [],
      fell: 3,
      hidden: true,
      collapses: 3,
    });
  });
});
