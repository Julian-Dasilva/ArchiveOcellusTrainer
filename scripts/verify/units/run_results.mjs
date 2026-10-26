export const captures = () => [
  "death-result.json", "death-result.png", "death-restart.json", "kill-result.json", "kill-result.png", "kill-result-small.png", "kill-retry.json",
  "death-result-page-errors.json", "kill-result-page-errors.json",
];

export function judge({ read, env }) {
  const { DEATH_RESULT_LINES: deathLines, KILL_RESULT_LINES: killLines, RESULT_BUTTONS: buttons, KILL_RESULT_BOSS_HP: killBossHp } = env;
  const [death, restart, kill, retry] = ["death-result.json", "death-restart.json", "kill-result.json", "kill-retry.json"].map(read);
  const params = (search) => Object.fromEntries(new URLSearchParams(search));
  const same = (a, b) => JSON.stringify(a) === b;
  const checks = {
    deathResultShown: death.visible && same(death.lines, deathLines) && same(death.buttons, buttons) && death.run?.kind === "ended" && death.run.reason === "death" && death.run.at === 54,
    resultRestartDrawsFreshSeed: same(params(restart.search), JSON.stringify({ focus: "void-floor", setup: "ranged" })) && restart.seed !== 1 && restart.panel === false,
    bossHpLinkStartsLow: retry.start.bossHp === Number(killBossHp) && same(params(retry.start.search), JSON.stringify({ seed: "4", bosshp: killBossHp })),
    killResultShown: kill.visible && same(kill.lines, killLines) && same(kill.buttons, buttons) && kill.run?.kind === "ended" && kill.run.reason === "kill" && kill.run.at === 16,
    retryReplaysSeedAndBossHp: same(params(retry.retry.search), JSON.stringify({ seed: "4", bosshp: killBossHp, setup: "ranged", focus: "full-fight" })) &&
      retry.retry.seed === 4 && retry.retry.bossHp === Number(killBossHp) && retry.retry.panel === false,
    noResultPageErrors: ["death-result-page-errors.json", "kill-result-page-errors.json"].map(read).every((list) => list.length === 0),
  };
  return { observed: {}, checks };
}
