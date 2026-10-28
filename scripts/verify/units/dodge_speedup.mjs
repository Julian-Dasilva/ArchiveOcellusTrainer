import { kindOf, sameJson } from "../lib.mjs";

export const captures = () => ["dodge-speedup.json", "dodge-speedup-console.log", "dodge-speedup-page-errors.json"];

export function judge({ read, env }) {
  const { EXPLOSION_INNER_MARKS, EXPLOSION_DAMAGE_REDUCTION_PERCENT: explosionReduction, DODGE_SPEEDUP_LAST_TICK: dodgeLastTick,
    DODGE_SPEEDUP_ATTACKS: dodgeAttacks } = env;
  const innerMarks = `[${EXPLOSION_INNER_MARKS.replaceAll(" ", ",")}]`;
  const dodgeLog = read("dodge-speedup.json");
  const observed = {
    explosions: {
      speedup: {
        attacks: dodgeLog.rows.filter((row) => row.tick <= Number(dodgeLastTick) && row.combatDraws > 0).map((row) => row.tick),
        dodges: kindOf(dodgeLog.rows, "explosion-resolved").map((e) => [e.at, e.tile, e.outcome.kind, e.outcome.attackDelay ?? null]),
        steps: dodgeLog.rows.filter((row) => row.inputs.length > 0).map((row) => [row.tick, row.inputs.map((input) => input.destination ?? input.prayer)]),
        bossHits: dodgeLog.rows.flatMap((row) => row.events.filter((e) => e.kind === "player-hit-judged").map((e) => [e.at, e.outcome, e.requested, row.bossHp.atBossStep - row.bossHp.atPostTick])),
      },
    },
  };
  const { speedup } = observed.explosions;
  const checks = {
    hitsDuringTheExplosionsLoseTheReduction: (() => {
      const marks = JSON.parse(innerMarks);
      const during = (at) => at >= marks[0] && at <= marks[marks.length - 1] + 1;
      const kept = (requested) => Math.floor((requested * (100 - Number(explosionReduction))) / 100);
      return speedup.bossHits.some(([at, , requested]) => during(at) && requested > 0 && kept(requested) < requested) &&
        speedup.bossHits.every(([at, outcome, requested, lost]) => (during(at) ? outcome === "reduced" && lost === kept(requested) : outcome === "passed" && lost === requested));
    })(),
    oneTileDodgesKeepTheBlowpipeFiring: sameJson(speedup.attacks, dodgeAttacks) && speedup.dodges.length === JSON.parse(innerMarks).length && speedup.dodges.every(([, , kind]) => kind === "dodged"),
  };
  return { observed, checks };
}
