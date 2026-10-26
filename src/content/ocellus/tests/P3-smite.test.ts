import type { HitReceipt } from "../../../sim/combat";
import type { SpinVerdict } from "../js/P3Types";
import type { At } from "./drill";
import { startP3Drill } from "./p3drill";

const S = 27;
const LANDINGS = { 1: [32], 2: [32, 35], 3: [32, 35, 38] } as const;
const MISSED_SPIN: Readonly<Record<number, number>> = { 32: 18, 35: 21, 38: 29 };
const SPAWN: At = { x: 19, y: 9 };
const KNOCK_CHAT = "You've been injured and can't use protection prayers!";

type Rule = "off-then-on" | "on-off-on" | "held-blocks";
type Said = "blocked" | "struck held" | "struck late" | "struck early" | "struck knocked";
type Prayer = "melee" | null;
type FlickCase = Readonly<{ quadrant: 1 | 2 | 3; name: string; toggles: readonly number[]; verdicts: Readonly<Record<Rule, readonly Said[]>> }>;

const PRAYER_AT_LANDING: Readonly<Record<Said, Prayer>> = { blocked: "melee", "struck held": "melee", "struck early": "melee", "struck late": null, "struck knocked": null };
const all = (...said: readonly Said[]): Readonly<Record<Rule, readonly Said[]>> => ({ "off-then-on": said, "on-off-on": said, "held-blocks": said });

const CASES: readonly FlickCase[] = [
  { quadrant: 1, name: "flick: off after S, on after S+4", toggles: [S, S + 4], verdicts: all("blocked") },
  {
    quadrant: 1,
    name: "earliest off and back on at once: off after S, on after S+1",
    toggles: [S, S + 1],
    verdicts: { "off-then-on": ["struck knocked"], "on-off-on": ["blocked"], "held-blocks": ["blocked"] },
  },
  { quadrant: 1, name: "tightest: off after S+3, on after S+4", toggles: [S + 3, S + 4], verdicts: all("blocked") },
  {
    quadrant: 1,
    name: "off from before the smite until the landing: off after S-1, on after S+4",
    toggles: [S - 1, S + 4],
    verdicts: { "off-then-on": ["blocked"], "on-off-on": ["struck early"], "held-blocks": ["blocked"] },
  },
  { quadrant: 1, name: "on one tick too late: off after S, on after S+5", toggles: [S, S + 5], verdicts: all("struck late") },
  {
    quadrant: 1,
    name: "off on the landing tick: off after S+4",
    toggles: [S + 4],
    verdicts: { "off-then-on": ["struck knocked"], "on-off-on": ["struck late"], "held-blocks": ["struck late"] },
  },
  { quadrant: 1, name: "held through", toggles: [], verdicts: { "off-then-on": ["struck knocked"], "on-off-on": ["struck held"], "held-blocks": ["blocked"] } },
  {
    quadrant: 1,
    name: "off and on inside one interval: both after S+1",
    toggles: [S + 1, S + 1],
    verdicts: { "off-then-on": ["struck knocked"], "on-off-on": ["struck held"], "held-blocks": ["blocked"] },
  },
  { quadrant: 2, name: "flick both: off after S and S+5, on after S+4 and S+7", toggles: [S, S + 4, S + 5, S + 7], verdicts: all("blocked", "blocked") },
  { quadrant: 2, name: "second spin timed like the first: on after S+8", toggles: [S, S + 4, S + 5, S + 8], verdicts: all("blocked", "struck late") },
  {
    quadrant: 2,
    name: "held between the spins: off after S, on after S+4",
    toggles: [S, S + 4],
    verdicts: { "off-then-on": ["blocked", "struck knocked"], "on-off-on": ["blocked", "struck held"], "held-blocks": ["blocked", "blocked"] },
  },
  { quadrant: 2, name: "tightest second spin: second off after S+6", toggles: [S, S + 4, S + 6, S + 7], verdicts: all("blocked", "blocked") },
  {
    quadrant: 3,
    name: "flick all three: off after S, S+5 and S+8, on after S+4, S+7 and S+10",
    toggles: [S, S + 4, S + 5, S + 7, S + 8, S + 10],
    verdicts: all("blocked", "blocked", "blocked"),
  },
  {
    quadrant: 3,
    name: "third held: the third pair left out",
    toggles: [S, S + 4, S + 5, S + 7],
    verdicts: { "off-then-on": ["blocked", "blocked", "struck knocked"], "on-off-on": ["blocked", "blocked", "struck held"], "held-blocks": ["blocked", "blocked", "blocked"] },
  },
  {
    quadrant: 3,
    name: "third one tick late: third on after S+11",
    toggles: [S, S + 4, S + 5, S + 7, S + 8, S + 11],
    verdicts: all("blocked", "blocked", "struck late"),
  },
];

const said = (verdict: SpinVerdict): Said => (verdict.kind === "blocked" ? "blocked" : `struck ${verdict.why}`);

async function flicked(quadrant: 1 | 2 | 3, toggles: readonly number[], { flick, firstSpin }: Readonly<{ flick?: Rule; firstSpin?: 4 }> = {}) {
  const drill = await startP3Drill({ seed: 1, invincible: true, start: quadrant === 1 ? undefined : quadrant, flick, firstSpin });
  drill.pray("Protect from Melee");
  for (const after of toggles) {
    drill.tickTo(after);
    drill.pray("Protect from Melee");
  }
  drill.tickTo(LANDINGS[quadrant][LANDINGS[quadrant].length - 1] + 1);
  return drill;
}

async function flickRun(quadrant: 1 | 2 | 3, toggles: readonly number[], options: Readonly<{ flick?: Rule; firstSpin?: 4 }> = {}) {
  const drill = await flicked(quadrant, toggles, options);
  const spins = drill.events("player-hit").flatMap(({ at, hit, receipt }) => (hit.kind === "spin" ? [[at, hit.spin.nth, hit.spin.of, said(hit.verdict), receipt.requested, receipt.applied, receipt.prayer]] : []));
  drill.dispose();
  return spins;
}

const expectedSpins = ({ quadrant, verdicts }: FlickCase, rule: Rule) =>
  LANDINGS[quadrant].map((at, k) => {
    const verdict = verdicts[rule][k];
    const requested = verdict === "blocked" ? 0 : MISSED_SPIN[at];
    return [at, k + 1, quadrant, verdict, requested, requested, PRAYER_AT_LANDING[verdict]];
  });

describe("P3 smite flick", () => {
  test.each(CASES)("under the default off-then-on rule, quadrant $quadrant, $name", async (flickCase) => {
    expect(await flickRun(flickCase.quadrant, flickCase.toggles)).toEqual(expectedSpins(flickCase, "off-then-on"));
  });

  test.each(CASES.flatMap((flickCase) => (["on-off-on", "held-blocks"] as const).map((rule) => ({ rule, ...flickCase }))))(
    "under flick=$rule, quadrant $quadrant, $name",
    async ({ rule, ...flickCase }) => {
      expect(await flickRun(flickCase.quadrant, flickCase.toggles, { flick: rule })).toEqual(expectedSpins(flickCase, rule));
    },
  );

  test.each([
    {
      name: "guard, the option keeps the earlier landing: firstSpin=4 lands quadrant 1's spin at S+4, so on after S+3 blocks it at 31",
      quadrant: 1,
      toggles: [S, S + 3],
      spins: [[31, 1, 1, "blocked", 0, 0, "melee"]],
    },
    { name: "firstSpin=4 lands quadrant 1's spin at S+4, so on after S+4 is one tick late for 31", quadrant: 1, toggles: [S, S + 4], spins: [[31, 1, 1, "struck late", 10, 10, null]] },
    {
      name: "guard, the option keeps the earlier landings: firstSpin=4 lands quadrant 2's spins at S+4 and S+7, so off after S and S+4, on after S+3 and S+6 blocks 31 and 34",
      quadrant: 2,
      toggles: [S, S + 3, S + 4, S + 6],
      spins: [[31, 1, 2, "blocked", 0, 0, "melee"], [34, 2, 2, "blocked", 0, 0, "melee"]],
    },
  ] as const)("$name", async ({ quadrant, toggles, spins }) => {
    expect(await flickRun(quadrant, toggles, { firstSpin: 4 })).toEqual(spins);
  });

  test.each([
    {
      quadrant: 1,
      name: "spin 1 knocked: held through",
      toggles: [],
      chat: [KNOCK_CHAT, "Spin 1 of 1 hit you for 18. Your protection prayer was still up the tick before the spin, so the blades knocked it off. Turn it off after the blades start, then back on for the spin."],
    },
    {
      quadrant: 2,
      name: "spin 2 knocked: off after S, on after S+4",
      toggles: [S, S + 4],
      chat: [KNOCK_CHAT, "Spin 2 of 2 hit you for 21. Your protection prayer was still up the tick before the spin, so the blades knocked it off. Turn it off after spin 1 lands, then back on for the spin."],
    },
    {
      quadrant: 3,
      name: "spin 3 knocked: the third pair left out",
      toggles: [S, S + 4, S + 5, S + 7],
      chat: [KNOCK_CHAT, "Spin 3 of 3 hit you for 29. Your protection prayer was still up the tick before the spin, so the blades knocked it off. Turn it off after spin 2 lands, then back on for the spin."],
    },
    { quadrant: 1, name: "spin 1 late: off after S, on after S+5", toggles: [S, S + 5], chat: ["Spin 1 of 1 hit you for 18. Protect from Melee was not back on in time for the spin."] },
  ] as const)("a missed spin's chat names the moment that spin was judged from, quadrant $quadrant: $name", async ({ quadrant, toggles, chat }) => {
    const drill = await flicked(quadrant, toggles);
    const lines = drill.region.chat();
    drill.dispose();
    expect(lines).toEqual(chat);
  });

  test.each([
    {
      quadrant: 2,
      name: "spin 1 early, then spin 2 held from spin 1's landing: off after S-1, on after S+1",
      toggles: [S - 1, S + 1],
      chat: [
        "Spin 1 of 2 hit you for 18. Protect from Melee was already off when the smite started.",
        "Spin 2 of 2 hit you for 21. Protect from Melee stayed on. Turn it off after spin 1 lands, then back on for the spin.",
      ],
    },
    {
      quadrant: 3,
      name: "spin 2 late leaves the prayer off when it lands, so spin 3 is early: off after S, S+5, on after S+4, S+8",
      toggles: [S, S + 4, S + 5, S + 8],
      chat: ["Spin 2 of 3 hit you for 21. Protect from Melee was not back on in time for the spin.", "Spin 3 of 3 hit you for 29. Protect from Melee was already off when spin 2 landed."],
    },
  ] as const)("under flick=on-off-on, a missed spin's chat names its reference, quadrant $quadrant: $name", async ({ quadrant, toggles, chat }) => {
    const drill = await flicked(quadrant, toggles, { flick: "on-off-on" });
    const lines = drill.region.chat();
    drill.dispose();
    expect(lines).toEqual(chat);
  });

  test("a protection prayer still up the tick before the spin is switched off with the game's line, and stays locked until 3 ticks later", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    drill.pray("Protect from Melee");
    for (const after of [31, 32, 33]) {
      drill.tickTo(after);
      drill.pray("Protect from Melee");
    }
    drill.tickTo(34);
    const observed = {
      knocked: drill.events("prayer-knocked-off").map((event) => [event.at, event.spin.nth, event.until]),
      prayer: [31, 32, 33, 34].map((t) => [t, drill.row(t).playerAtBossStep.prayer, drill.row(t).playerAtPostTick.prayer]),
      chat: drill.region.chat(),
    };
    drill.dispose();
    expect(observed).toEqual({
      knocked: [[31, 1, 33]],
      prayer: [
        [31, "melee", null],
        [32, null, null],
        [33, null, null],
        [34, "melee", "melee"],
      ],
      chat: [KNOCK_CHAT, "Spin 1 of 1 hit you for 18. Your protection prayer was still up the tick before the spin, so the blades knocked it off. Turn it off after the blades start, then back on for the spin."],
    });
  });

  test.each<Readonly<{ prayer: boolean; blow: HitReceipt }>>([
    { prayer: true, blow: { requested: 0, applied: 0, beforeHp: 87, afterHp: 87, prayer: "melee" } },
    { prayer: false, blow: { requested: 2, applied: 2, beforeHp: 58, afterHp: 56, prayer: null } },
  ])("the smite starts at 27 and its opening blow lands at 28, a 0 under Protect from Melee: prayer on $prayer", async ({ prayer, blow }) => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    if (prayer) drill.pray("Protect from Melee");
    drill.tickTo(S + 1);
    const observed = {
      stages: drill.events("stage-entered").map((event) => [event.at, event.stage]),
      blows: drill.events("player-hit").flatMap(({ at, hit, receipt }) => (hit.kind === "smite-blow" ? [[at, receipt]] : [])),
    };
    drill.dispose();
    expect(observed).toEqual({ stages: [[0, "arrive"], [7, "autos"], [S, "smite-1"]], blows: [[S + 1, blow]] });
  });

  test("the autos start again 4 ticks after the last spin: swings at 36, 39, 46 and 49 after quadrant 1's spin at 32", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true });
    drill.tickTo(50);
    const observed = {
      stages: drill.events("stage-entered").map((event) => [event.at, event.stage]),
      swings: drill.events("player-hit").flatMap(({ at, hit }) => (hit.kind === "swing" && at > S ? [at] : [])),
    };
    drill.dispose();
    expect(observed).toEqual({ stages: [[0, "arrive"], [7, "autos"], [S, "smite-1"], [36, "autos"]], swings: [36, 39, 46, 49] });
  });

  test("the blades wind 2 ticks before each landing: at 30, 33 and 36 for the spins at 32, 35 and 38", async () => {
    const drill = await startP3Drill({ seed: 1, invincible: true, start: 3 });
    drill.tickTo(38);
    const winds = drill.events("spin-winding").map((event) => [event.at, event.spin.nth, event.spin.of]);
    drill.dispose();
    expect(winds).toEqual([[30, 1, 3], [33, 2, 3], [36, 3, 3]]);
  });

  test.each([
    {
      name: "one spin, standing still",
      start: undefined,
      thrownAt: 30,
      move: false,
      expected: {
        aimed: [[30, SPAWN, 35, 80]],
        avoided: [],
        hits: [[35, "rubble", 16], [37, "void-patch", 6], [39, "void-patch", 6], [41, "void-patch", 7], [43, "void-patch", 6]],
      },
    },
    { name: "one spin, moving off after 30", start: undefined, thrownAt: 30, move: true, expected: { aimed: [[30, SPAWN, 35, 80]], avoided: [[35, SPAWN]], hits: [] } },
    {
      name: "two spins, standing still",
      start: 2,
      thrownAt: 33,
      move: false,
      expected: { aimed: [[33, SPAWN, 38, 69]], avoided: [], hits: [[38, "rubble", 14], [40, "void-patch", 6], [42, "void-patch", 7], [44, "void-patch", 6], [46, "void-patch", 7]] },
    },
  ])("rubble is thrown on the player's tile as the blades wind, lands 5 ticks later for 14 to 16, and leaves a void patch hitting 6 to 7 every second tick: $name", async ({ start, thrownAt, move, expected }) => {
    const drill = await startP3Drill({ seed: 1, invincible: true, start });
    drill.tickTo(thrownAt);
    if (move) await drill.click({ x: SPAWN.x - 1, y: SPAWN.y + 1 });
    drill.tickTo(thrownAt + 13);
    const observed = {
      aimed: drill.events("rubble-aimed").map((event) => [event.at, event.tile, event.landsAt, event.until]),
      avoided: drill.events("hazard-avoided").map((event) => [event.at, event.tile]),
      hits: drill.events("player-hit").flatMap(({ at, hit, receipt }) => (hit.kind === "rubble" || hit.kind === "void-patch" ? [[at, hit.kind, receipt.requested]] : [])),
    };
    drill.dispose();
    expect(observed).toEqual(expected);
  });

  test.each([
    { start: 2, hp: 3990 },
    { start: 3, hp: 2677 },
  ])("start=$start opens the boss at ⌊5250 × the previous threshold⌋ = $hp", async ({ start, hp }) => {
    const drill = await startP3Drill({ seed: 1, start });
    drill.tickTo(0);
    const observed = drill.region.snapshot()?.boss.hp;
    drill.dispose();
    expect(observed).toBe(hp);
  });
});
