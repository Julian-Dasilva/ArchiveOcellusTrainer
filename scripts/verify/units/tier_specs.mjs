const specs = (env) =>
  env.TIER_SPECS.split("\n").map((line) => {
    const [name, query, weapon, wear, tick, cost, graphics, effect] = line.split("|");
    return { name, query, weapon: Number(weapon), wear: wear === "-" ? null : Number(wear), tick: Number(tick), cost: cost === "-" ? 0 : Number(cost), graphics: graphics.split(",").map(Number), effect };
  });

export const captures = (env) =>
  specs(env).flatMap(({ name }) => ["before.json", "after.json", "log.json", "graphics.json", "page-errors.json"].map((file) => `tier-specs-${name}-${file}`).concat(`tier-specs-${name}.png`));

export function judge({ read, env }) {
  const observed = { tierSpecs: {} };
  const checks = {};
  for (const { name, weapon, wear, tick, cost, graphics, effect } of specs(env)) {
    const [before, after, rows, seen] = ["before", "after", "log", "graphics"].map((file) => read(`tier-specs-${name}-${file}.json`));
    const hits = rows.flatMap((row) => row.events.filter((event) => event.kind === "player-hit-judged").map((event) => [event.at, event.outcome, event.requested]));
    observed.tierSpecs[name] = {
      worn: [after.player.equipped.weapon, after.player.equipped.ammo],
      energy: [before.player.specialEnergy, after.player.specialEnergy],
      bossHp: [before.boss.hp, after.boss.hp],
      bossDefence: [before.boss.defence, after.boss.defence],
      hits,
      graphics: seen,
    };
    const landed = hits.some(([at, outcome, requested]) => at >= tick && outcome !== "blocked" && requested > 0);
    checks[`${name}Fired`] =
      after.player.equipped.weapon === weapon &&
      (wear === null || after.player.equipped.ammo === wear) &&
      before.player.specialEnergy === 100 &&
      after.player.specialEnergy === 100 - cost;
    checks[`${name}Landed`] = landed && (effect !== "defence" || after.boss.defence < before.boss.defence);
    checks[`${name}DrewItsGraphics`] = graphics.every((id) => seen[id] !== undefined && seen[id] >= tick);
  }
  return { observed, checks };
}
