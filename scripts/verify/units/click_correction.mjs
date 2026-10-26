import { sameJson } from "../lib.mjs";

export const captures = () => ["click-correction.json", "click-correction.png", "click-correction-page-errors.json"];

export function judge({ read, env }) {
  const { CORRECTION_EXPECTED: correctionExpected } = env;
  const correction = read("click-correction.json");
  const checks = {
    lastClickInATickWins: correction.downs.length === 2 && correction.downs[0].tick === correction.downs[1].tick &&
      sameJson(correction.orderRows, JSON.stringify([{ worldTick: correction.downs[0].tick + 1, orders: JSON.parse(correctionExpected).orders }])) &&
      sameJson(correction.tiles, JSON.stringify(JSON.parse(correctionExpected).tiles)),
  };
  return { observed: {}, checks };
}
