import { kindOf, sameJson } from "../lib.mjs";

export const captures = () => [
  "invincible-default.json", "invincible-linked.json", "invincible.png", "invincible-chat.json", "invincible.json", "invincible-console.log", "invincible-page-errors.json",
  "invincible-restarted.json", "invincible-orb.png", "invincible-orb.json", "invincible-orb-console.log", "invincible-orb-page-errors.json",
];

export function judge({ read, env }) {
  const { VOID_FLOOR_HITS: voidHits, INVINCIBLE_LAST_TICK: invincibleLastTick, INVINCIBLE_EXPECTED: invincibleExpected, INVINCIBLE_ORB_EXPECTED: invincibleOrbExpected } = env;
  const [invincibleDefault, invincibleLinked, invincibleChat, invincibleLog, invincibleRestarted, invincibleOrbLog] =
    ["invincible-default.json", "invincible-linked.json", "invincible-chat.json", "invincible.json", "invincible-restarted.json", "invincible-orb.json"].map(read);
  const observed = {
    invincible: {
      defaultToggle: invincibleDefault,
      linkedToggle: invincibleLinked,
      floorHits: kindOf(invincibleLog.rows, "floor-hit").map((e) => [e.at, e.receipt.applied]),
      prevented: kindOf(invincibleLog.rows, "death-prevented").map((e) => [e.at, e.source]),
      hp: invincibleLog.rows.filter((row) => row.tick === 53 || row.tick === 54).map((row) => [row.tick, row.playerAtPostTick.hp]),
      ended: kindOf(invincibleLog.rows, "run-ended").map((e) => [e.at, e.reason]),
      lastTick: invincibleLog.rows[invincibleLog.rows.length - 1]?.tick ?? -1,
      chat: invincibleChat.data?.text ?? null,
      restarted: invincibleRestarted,
      orb: {
        walks: invincibleOrbLog.rows.flatMap((row) => row.inputs.filter((i) => i.kind === "walk-ordered").map((i) => [row.tick, i.destination])),
        prevented: kindOf(invincibleOrbLog.rows, "death-prevented").map((e) => [e.at, e.source, e.clearedOrbCredit]),
        returned: kindOf(invincibleOrbLog.rows, "orb-returned").map((e) => [e.at, e.receipt]),
        hp: invincibleOrbLog.rows.map((row) => [row.tick, row.playerAtPostTick.hp]),
      },
    },
  };
  const { invincible } = observed;
  const expectedInvincible = JSON.parse(invincibleExpected);
  const expectedRevival = JSON.parse(invincibleOrbExpected);
  const checks = {
    invincibleStartsUnchecked: invincible.defaultToggle.visible === true && invincible.defaultToggle.checked === false,
    invincibleLinkSurvivesTheLethalHit: invincible.linkedToggle.checked === true && sameJson(invincible.floorHits.filter(([at]) => at <= 54), voidHits) &&
      sameJson(invincible.prevented, JSON.stringify(expectedInvincible.prevented)) && sameJson(invincible.hp, JSON.stringify(expectedInvincible.hp)) &&
      invincible.ended.length === 0 && invincible.lastTick >= Number(invincibleLastTick),
    invincibleChatShown: invincible.chat === expectedInvincible.chat,
    restartKeepsInvincible: new URLSearchParams(invincible.restarted.search).get("invincible") === "on" && invincible.restarted.toggle.checked === true,
    invincibleOrbReturnsNothingAfterRevival: sameJson(invincible.orb.prevented[0], JSON.stringify(expectedRevival.revived)) &&
      sameJson(invincible.orb.returned, JSON.stringify(expectedRevival.returned)) &&
      sameJson(invincible.orb.hp.find(([t]) => t === expectedRevival.hp[0]), JSON.stringify(expectedRevival.hp)) &&
      invincible.orb.hp.every(([, hp]) => hp <= expectedRevival.maxHp),
  };
  return { observed, checks };
}
