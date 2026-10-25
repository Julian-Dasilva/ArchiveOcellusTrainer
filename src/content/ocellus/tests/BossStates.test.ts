import { stateContractBreaks } from "../../../../review-ratchet/checks/observable-states.mjs";
import type { BossState } from "../js/P4Types";
import { startDrill } from "./drill";

type Presence = Readonly<{ visible: boolean; targetable: boolean }>;

const PRESENCE = {
  hidden: { visible: false, targetable: false },
  "present-out-of-melee-reach": { visible: true, targetable: true },
  "present-damageable": { visible: true, targetable: true },
} satisfies Record<BossState, Presence>;

describe("boss states", () => {
  test("guard: every boss state the fight logs shows its contracted presence: hidden is neither drawn nor targetable, and every present state is both", async () => {
    const drill = startDrill();
    const observations = [];
    for (let t = 0; t <= 70; t++) {
      await drill.playCorrectlyTo(t);
      const changes = drill.events("boss-state-changed");
      const latest = changes[changes.length - 1];
      if (!latest) continue;
      observations.push({ tick: t, state: latest.state, observed: { visible: drill.region.snapshot()?.boss.visible ?? false, targetable: drill.boss().canBeAttacked() } });
    }
    drill.dispose();
    expect({ reached: [...new Set(observations.map(({ state }) => state))], ...stateContractBreaks(PRESENCE, observations) }).toEqual({
      reached: ["hidden", "present-damageable", "present-out-of-melee-reach"],
      mismatches: [],
      unreached: [],
    });
  });
});
