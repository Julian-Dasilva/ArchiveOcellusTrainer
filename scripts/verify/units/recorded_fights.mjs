import { isDeepStrictEqual } from "node:util";
import { kindOf, rowAt } from "../lib.mjs";

export const captures = () => [
  "recorded-lead-in.png", "recorded-lead-in.json", "recorded-lead-in-page-errors.json", "recorded-orb-waiting.png", "recorded-orb-returned.png", "recorded-orb.json",
  "recorded-orb-page-errors.json", "recorded-rift.json", "recorded-rift-page-errors.json",
];

export function judge({ read, env }) {
  const expected = { leadIn: JSON.parse(env.RECORDED_LEAD_IN_EXPECTED), orb: JSON.parse(env.RECORDED_ORB_EXPECTED), rift: JSON.parse(env.RECORDED_RIFT_EXPECTED) };
  const [leadInLog, orbLog, riftLog] = ["recorded-lead-in.json", "recorded-orb.json", "recorded-rift.json"].map(read);
  const hpAt = (log, t) => rowAt(log.rows, t)?.bossHp ?? null;
  const observed = {
    leadIn: {
      states: kindOf(leadInLog.rows, "boss-state-changed").map((e) => [e.at, e.state]),
      judged: kindOf(leadInLog.rows, "player-hit-judged").map((e) => [e.at, e.outcome, e.requested]),
      bossHp: [expected.leadIn.bossHp[0], hpAt(leadInLog, expected.leadIn.bossHp[0])],
    },
    orb: { matured: kindOf(orbLog.rows, "orb-matured").map((e) => [e.at, e.tile]), returned: kindOf(orbLog.rows, "orb-returned").map((e) => [e.at, e.receipt]) },
    rift: { hits: kindOf(riftLog.rows, "rift-hit").map((e) => [e.at, e.rift, e.style, e.damage]), destroyed: kindOf(riftLog.rows, "rift-destroyed").map((e) => [e.at, e.rift, e.attackDelay]) },
  };
  const checks = {
    leadInShotLandsInFull: isDeepStrictEqual(observed.leadIn, expected.leadIn),
    orbReturnsOnMaturityToWaitingPlayer: isDeepStrictEqual(observed.orb, expected.orb),
    riftKillResetsTheNextShot: isDeepStrictEqual(observed.rift, expected.rift),
    noRecordedFightPageErrors: ["recorded-lead-in-page-errors.json", "recorded-orb-page-errors.json", "recorded-rift-page-errors.json"].map(read).every((list) => list.length === 0),
  };
  return { observed, checks };
}
