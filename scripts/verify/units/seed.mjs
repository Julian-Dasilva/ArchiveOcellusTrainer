export const captures = () => ["seed-fresh.png", "seed.json", "seed.png", "seed-console.log", "seed-page-errors.json"];

export function judge({ read }) {
  const seeds = read("seed.json");
  const seedInUrl = (run) => new URLSearchParams(run.search).get("seed");
  const observed = { seeds };
  const checks = {
    seedFreshAndShown: /^\d+$/.test(seeds.fresh.box) && Number(seeds.fresh.box) === seeds.fresh.seed && seeds.fresh.seed !== 1 && seedInUrl(seeds.fresh) === null,
    restartDrawsFreshSeed: seedInUrl(seeds.restarted) === null && seeds.restarted.seed !== seeds.fresh.seed && Number(seeds.restarted.box) === seeds.restarted.seed,
    typedSeedReplays: seedInUrl(seeds.typed) === seeds.fresh.box && seeds.typed.seed === seeds.fresh.seed && seeds.typed.box === seeds.fresh.box,
  };
  return { observed, checks };
}
