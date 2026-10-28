import { between, fromCentreOf, kindOf, onScheduleWithin, pixels, rowAt, sameJson } from "../lib.mjs";

export const captures = ({ OVERHEAD_SHOT_TICKS }) => [
  ...OVERHEAD_SHOT_TICKS.split(" ").map((tick) => `overhead-${tick}.png`), "overhead-draws.json", "rift-spawned.png", "rift-destroyed.png", "rift-chat.json", "rift-burst.png",
  "rifts.json", "rift-audio.json", "rift-console.log", "rift-page-errors.json", "rift-ralos.json", "rift-ralos-console.log", "rift-ralos-page-errors.json", "rift-melee-hit.png",
  "rift-melee.json", "rift-melee-console.log", "rift-melee-page-errors.json", "hover-out-of-reach.png", "deflect-blocked.png", "deflect.json", "deflect-console.log",
  "deflect-page-errors.json", "rift-charged.png", "reflect-none.png", "reflect-hit.png", "reflect.json", "reflect-console.log", "reflect-page-errors.json", "canvas-centre.json",
  "rift-timed-tile.json",
];

export function judge({ read, bytes, env }) {
  const { OVERHEAD_SHOT_TICKS: overheadShots, ICON_BOX: iconBox, RIFT_EXPECTED: riftExpected, RIFT_BURST_TICK: burstTick, KILL_CHAT: killChat,
    RIFT_SOUND_SAMPLES: riftSoundSamples, RIFT_SPAWN_SOUNDS: riftSpawnSounds, RIFT_KILL_SOUND: riftKillSound, RIFT_BURST_SOUNDS: riftBurstSounds,
    RIFT_SOUND_WINDOW: riftSoundWindow, OVERHEAD_GAP_DRAWS: gapDraws, DEFLECT_HOVER_TILE: hoverTile, DEFLECT_HOVER_TICKS: hoverTicks,
    DEFLECT_FIRST_MELEE_TICK: firstMeleeTick, RIFT_TIMER_BOX: riftTimerBox, RIFT_TIMER_MAX_EARLY_SHARE: riftTimerMaxEarly, RIFT_TIMER_MIN_FULL_SHARE: riftTimerMinFull,
    RIFT_RANGED_HITS: riftRangedHits, RIFT_RALOS_HITS: riftRalosHits, RIFT_MELEE_HITS: riftMeleeHits, REFLECT_EXPECTED: reflectExpected, REFLECT_SPLAT_BOX: reflectSplatBox,
    REFLECT_MIN_SPLAT_SHARE: reflectMinSplat, REFLECT_MAX_CLEAR_SHARE: reflectMaxClear, SOUND_TOLERANCE_TICKS: soundTolerance } = env;
  const { x: centreX, y: centreY } = read("canvas-centre.json");
  const { pixelShare } = pixels(bytes);
  const fromCentre = fromCentreOf(centreX, centreY);
  const timedRift = read("rift-timed-tile.json");
  const onSchedule = onScheduleWithin(soundTolerance);
  const [riftLog, riftChat, riftAudio, deflectLog, overheadDraws] = ["rifts.json", "rift-chat.json", "rift-audio.json", "deflect.json", "overhead-draws.json"].map(read);
  const reflectLog = read("reflect.json");
  const ralosLog = read("rift-ralos.json");
  const meleeRiftLog = read("rift-melee.json");
  const iconArea = fromCentre(iconBox);
  const iconColours = {
    blue: (r, g, b) => r <= 80 && g <= 190 && b >= 200,
    red: (r, g, b) => r >= 150 && r <= 240 && g <= 80 && b <= 80,
    orange: (r, g, b) => r >= 170 && g >= 100 && g <= 165 && b <= 100,
  };
  function iconIn(file) {
    const share = Object.fromEntries(Object.entries(iconColours).map(([name, matches]) => [name, pixelShare(file, matches, iconArea)]));
    const icon = share.blue >= 0.2 ? (share.red >= 0.2 ? "deflect-melee" : share.orange >= 0.06 ? "deflect-range" : "unknown") : share.red >= 0.2 ? "soul-split" : null;
    return { ...share, icon };
  }
  const overheadAt = (rows, t) => rowAt(rows, t)?.phase.overhead;
  const expectedRifts = JSON.parse(riftExpected);
  const riftSamplesOf = JSON.parse(riftSoundSamples);
  const [riftFrom, riftTo] = JSON.parse(riftSoundWindow);
  const riftTimed = (list) => list.map(([at, id]) => [at, riftSamplesOf[id]]);
  const riftHeard = (ids) => {
    const lengths = new Set(ids.map((id) => riftSamplesOf[id]));
    return riftAudio
      .filter((s) => s.rate === 22050 && s.tick !== null && lengths.has(s.samples) && s.tick + s.phase >= riftFrom && s.tick + s.phase < riftTo)
      .map((s) => [Math.round((s.tick + s.phase) * 100) / 100, s.samples]);
  };
  const [killOffset, killId] = JSON.parse(riftKillSound);
  const destroyedAt = kindOf(riftLog.rows, "rift-destroyed")[0]?.at ?? null;
  const riftExpectedSounds = {
    spawn: riftTimed(JSON.parse(riftSpawnSounds)),
    kill: destroyedAt === null ? [] : riftTimed([[destroyedAt + killOffset, killId]]),
    burst: riftTimed(JSON.parse(riftBurstSounds)),
  };
  const timerShare = (file) => pixelShare(file, (r, g, b) => r >= 180 && g >= 140 && b <= 90 && r - b >= 120, fromCentreOf(timedRift.x, timedRift.y)(riftTimerBox));
  const splatShare = (file) => pixelShare(file, (r, g, b) => r >= 120 && g <= 40 && b <= 40, fromCentre(reflectSplatBox));
  const observed = {
    overheads: {
      box: iconArea,
      shots: overheadShots.split(" ").map(Number).map((t) => ({ tick: t, logged: [overheadAt(riftLog.rows, t), overheadAt(riftLog.rows, t + 1)], ...iconIn(`overhead-${t}.png`) })),
      gapDraws: Object.keys(JSON.parse(gapDraws)).map((t) => ({ tick: Number(t), logged: overheadAt(riftLog.rows, t) ?? null, frames: overheadDraws[t]?.frames ?? 0, sprites: [...(overheadDraws[t]?.sprites ?? [])].sort() })),
      hover: {
        standsOn: [...new Set(between(deflectLog.rows, ...JSON.parse(hoverTicks)).map((row) => JSON.stringify(row.playerAtPostTick.tile)))].map((tile) => JSON.parse(tile)),
        bossHp: [rowAt(deflectLog.rows, JSON.parse(hoverTicks)[0])?.bossHp.atBossStep, rowAt(deflectLog.rows, Number(firstMeleeTick) - 1)?.bossHp.atPostTick],
      },
      meleeJudged: kindOf(deflectLog.rows, "player-hit-judged").filter((e) => e.style === "melee").map((e) => {
        const hp = rowAt(deflectLog.rows, e.at)?.bossHp;
        return { at: e.at, overhead: overheadAt(deflectLog.rows, e.at), outcome: e.outcome, taken: hp ? hp.atBossStep - hp.atPostTick : null };
      }),
    },
    rifts: {
      spawned: kindOf(riftLog.rows, "rift-spawned").map((e) => [e.at, e.rift, e.tile]),
      destroyed: kindOf(riftLog.rows, "rift-destroyed").map((e) => [e.at, e.rift]),
      destroyedAttackDelay: kindOf(riftLog.rows, "rift-destroyed").map((e) => e.attackDelay),
      bursts: kindOf(riftLog.rows, "rift-burst").map((e) => [e.at, e.rifts, e.receipt.requested]),
      hits: kindOf(riftLog.rows, "rift-hit").map((e) => [e.at, e.rift, e.style, e.damage]),
      ralosHits: kindOf(ralosLog.rows, "rift-hit").map((e) => [e.at, e.rift, e.style, e.damage]),
      meleeHits: kindOf(meleeRiftLog.rows, "rift-hit").map((e) => [e.at, e.rift, e.style, e.damage]),
      timerShares: { beforeSpawn: timerShare("overhead-45.png"), spawned: timerShare("rift-spawned.png"), charged: timerShare("rift-charged.png") },
      chat: riftChat.data?.text ?? null,
      sounds: {
        spawn: riftHeard(JSON.parse(riftSpawnSounds).map(([, id]) => id)),
        kill: riftHeard([killId]),
        burst: riftHeard(JSON.parse(riftBurstSounds).map(([, id]) => id)),
        contexts: [...new Set(riftAudio.map((s) => s.state))],
      },
    },
    reflect: {
      judged: kindOf(reflectLog.rows, "player-hit-judged").map((e) => [e.at, e.style, e.outcome, e.requested]),
      reflected: kindOf(reflectLog.rows, "deflect-reflected").map((e) => [e.at, e.style, e.receipt.applied]),
      hpAfter: rowAt(reflectLog.rows, JSON.parse(reflectExpected).judged.at(-1)[0])?.playerAtPostTick.hp ?? null,
      splatShares: { unreflected: splatShare("reflect-none.png"), reflected: splatShare("reflect-hit.png") },
    },
  };
  const { shots: iconShots, gapDraws: drawnAroundGaps, hover, meleeJudged } = observed.overheads;
  const { rifts } = observed;
  const checks = {
    overheadIconsDrawn: iconShots.every((shot) => shot.logged[0] !== undefined && shot.logged[0] === shot.logged[1] && shot.icon === shot.logged[0]),
    overheadDroppedBeforeEachVoid: drawnAroundGaps.every(({ tick, frames, sprites }) => frames > 0 && sameJson(sprites, JSON.stringify(JSON.parse(gapDraws)[tick]))) &&
      drawnAroundGaps.filter(({ sprites }) => sprites.length === 0).every(({ logged }) => logged === null),
    meleeCannotReachHoveringBoss: sameJson(hover.standsOn, `[${hoverTile}]`) && hover.bossHp[0] !== undefined && hover.bossHp[0] === hover.bossHp[1] &&
      meleeJudged.length > 0 && meleeJudged[0].at === Number(firstMeleeTick) && meleeJudged.every((e) => e.at >= Number(firstMeleeTick)),
    deflectBlocksMeleeUntilSoulSplit: meleeJudged.filter((e) => e.outcome === "blocked").length >= 2 && meleeJudged.filter((e) => e.outcome === "passed").length >= 2 &&
      meleeJudged.every((e) => e.outcome === (e.overhead === "deflect-melee" ? "blocked" : "passed") && (e.outcome === "passed" || e.taken === 0)) &&
      meleeJudged.reduce((sum, e) => sum + (e.outcome === "passed" ? e.taken : 0), 0) > 0,
    riftsSpawnBesideBoss: sameJson(rifts.spawned, JSON.stringify(expectedRifts.spawned)),
    riftKilledByClick: rifts.destroyed.length === 1 && rifts.destroyed[0][1] === expectedRifts.destroyed && rifts.destroyed[0][0] <= Number(burstTick),
    killChatShown: rifts.chat.split("\n").at(-1) === killChat,
    standingRiftBursts: sameJson(rifts.bursts, JSON.stringify(expectedRifts.bursts)),
    riftsTakeStandardRangedMaxHits: sameJson(rifts.hits, riftRangedHits) && sameJson(rifts.ralosHits, riftRalosHits),
    riftsTakeStandardMeleeMaxHits: sameJson(rifts.meleeHits, riftMeleeHits),
    riftTimerBarFills: rifts.timerShares.beforeSpawn === 0 && rifts.timerShares.spawned > 0 && rifts.timerShares.spawned <= Number(riftTimerMaxEarly) && rifts.timerShares.charged >= Number(riftTimerMinFull),
    deflectReflectsATenth: sameJson({ judged: observed.reflect.judged, reflected: observed.reflect.reflected }, reflectExpected) &&
      observed.reflect.judged.every(([at, style, outcome, requested]) => observed.reflect.reflected.filter((r) => r[0] === at).length === (outcome === "blocked" && Math.floor(requested / 10) > 0 ? 1 : 0)),
    reflectHitsplatOnPlayer: observed.reflect.splatShares.reflected >= Number(reflectMinSplat) && observed.reflect.splatShares.unreflected <= Number(reflectMaxClear),
    riftSpawnSoundsOnFrame: onSchedule(rifts.sounds.spawn, riftExpectedSounds.spawn) && sameJson(rifts.sounds.contexts, JSON.stringify(["running"])),
    riftKillSoundOnFrame: riftExpectedSounds.kill.length === 1 && onSchedule(rifts.sounds.kill, riftExpectedSounds.kill) && sameJson(rifts.sounds.contexts, JSON.stringify(["running"])),
    // The full cycle plays other sounds of these lengths, such as the explosion series' start at 74, so the burst's two are looked for among them.
    riftBurstSoundsOnFrames: riftExpectedSounds.burst.every(([at, samples]) => rifts.sounds.burst.some(([h, s]) => s === samples && Math.abs(h - at) <= Number(soundTolerance))) && sameJson(rifts.sounds.contexts, JSON.stringify(["running"])),
  };
  return { observed, checks };
}
