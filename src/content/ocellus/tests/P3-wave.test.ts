import type { At } from "./drill";
import { startP3Drill } from "./p3drill";

const SPAWN: At = { x: 19, y: 9 };
const SOUTH_OF_BOSS: At = { x: 20, y: 9 };
const ONE_WEST: At = { x: 19, y: 9 };
const TWO_WEST: At = { x: 18, y: 9 };

type Step = Readonly<{ after: number; to: At; walk?: true }>;

async function waveRun(stand: At, step: Step | null) {
  const drill = await startP3Drill({ seed: 1, invincible: true });
  drill.pray("Protect from Melee");
  drill.tickTo(0);
  await drill.click(stand);
  if (step !== null) {
    drill.tickTo(step.after);
    await drill.click(step.to, { ctrlKey: step.walk });
  }
  drill.tickTo(14);
  const observed = {
    aimed: drill.events("wave-aimed").map((event) => [event.at, event.line.map(({ x, y }) => [x, y]), event.landsAt]),
    hits: drill.events("player-hit").flatMap(({ at, hit, receipt }) => (hit.kind === "wave" ? [[at, [hit.tile.x, hit.tile.y], receipt.requested]] : [])),
    avoided: drill.events("hazard-avoided").flatMap(({ at, hazard, tile }) => (hazard === "wave" ? [[at, [tile.x, tile.y]]] : [])),
  };
  drill.dispose();
  return observed;
}

describe("P3 wave", () => {
  test.each([
    {
      name: "straight south of his centre (20, 7), it covers columns 19 to 21 from his 3x3 to the wedge's edge",
      stand: SOUTH_OF_BOSS,
      line: [[20, 9], [19, 9], [21, 9], [20, 10], [19, 10], [21, 10], [20, 11], [19, 11], [21, 11]],
    },
    {
      name: "at (19, 9), south-west of his centre (20, 7), it snaps to the south-west diagonal",
      stand: SPAWN,
      line: [[18, 8], [19, 9], [18, 9], [17, 9], [18, 10], [17, 10], [17, 11]],
    },
    {
      name: "at (22, 9), 63 degrees round from east of his centre (21, 7), it snaps to the nearer south-east diagonal, not south",
      stand: { x: 22, y: 9 },
      line: [[23, 8], [22, 9], [23, 9], [24, 9], [23, 10], [24, 10], [25, 10], [24, 11], [25, 11], [26, 11]],
    },
  ])("the wave is aimed at 12, a tick before his slash, on a 3-wide band toward the player: $name", async ({ stand, line }) => {
    expect((await waveRun(stand, null)).aimed).toEqual([[12, line, 14]]);
  });

  test.each<Readonly<{ name: string; step: Step | null; hits: readonly unknown[]; avoided: readonly unknown[] }>>([
    { name: "standing still takes 32 at 14", step: null, hits: [[14, [20, 9], 32]], avoided: [] },
    { name: "a run 2 tiles west clicked after 11 clears it", step: { after: 11, to: TWO_WEST }, hits: [], avoided: [[14, [18, 9]]] },
    { name: "a run 2 tiles west clicked after 12, the last click out, clears it", step: { after: 12, to: TWO_WEST }, hits: [], avoided: [[14, [18, 9]]] },
    { name: "a run 2 tiles west clicked after 10 is aimed at", step: { after: 10, to: TWO_WEST }, hits: [[14, [18, 9], 32]], avoided: [] },
    { name: "a run 2 tiles west clicked after 13 comes too late", step: { after: 13, to: TWO_WEST }, hits: [[14, [20, 9], 32]], avoided: [] },
    { name: "a run 1 tile west clicked after 12 stays on the band", step: { after: 12, to: ONE_WEST }, hits: [[14, [19, 9], 32]], avoided: [] },
    { name: "a walk 2 tiles west clicked after 11 clears it", step: { after: 11, to: TWO_WEST, walk: true }, hits: [], avoided: [[14, [18, 9]]] },
    { name: "a walk 2 tiles west clicked after 12 gets 1 tile out", step: { after: 12, to: TWO_WEST, walk: true }, hits: [[14, [19, 9], 32]], avoided: [] },
  ])("the wave lands at 14 on a player standing south of the boss: $name", async ({ step, hits, avoided }) => {
    const observed = await waveRun(SOUTH_OF_BOSS, step);
    expect({ hits: observed.hits, avoided: observed.avoided }).toEqual({ hits, avoided });
  });
});
