import { Settings, SoundCache } from "osrs-sdk";
import type { DrillSelection } from "../js/OcellusTimings";
import { startDrill } from "./drill";
import { loadPage } from "./page";

const LIFEFORCE_CHAT = "Ocellus manipulates your lifeforce!";
const SAVED_SETTINGS = "osrs-sdk:settings";

function cuesThrough(lastTick: number, selection: DrillSelection, act: (drill: ReturnType<typeof startDrill>, t: number) => void = () => undefined) {
  const drill = startDrill({ selection });
  // SoundCache.play is the SDK's audio output. jsdom has no AudioContext, so the spy reads each sound as it reaches that output.
  const play = vi.spyOn(SoundCache, "play");
  const sounds: [number, string][] = [];
  const chat: [number, string][] = [];
  for (let t = 0; t <= lastTick; t++) {
    const [played, said] = [play.mock.calls.length, drill.region.chat().length];
    act(drill, t);
    drill.tickTo(t);
    sounds.push(...play.mock.calls.slice(played).flatMap(([sound]): [number, string][] => (String(sound.src).startsWith("cache-sound:") ? [[t, sound.src]] : [])));
    chat.push(...drill.region.chat().slice(said).map((line): [number, string] => [t, line]));
  }
  play.mockRestore();
  drill.dispose();
  return { sounds, chat };
}

type Drill = ReturnType<typeof startDrill>;

function spotAnimsThrough(lastTick: number, drill: Drill, act: (t: number) => void = () => undefined) {
  // Unit.addSpotAnim is the SDK's entry for an effect on a unit, so the spies read each one as it reaches the player or the boss.
  const onPlayer = vi.spyOn(drill.player(), "addSpotAnim");
  const onBoss = vi.spyOn(drill.boss(), "addSpotAnim");
  const played: [number, string, number][] = [];
  for (let t = 0; t <= lastTick; t++) {
    const [player, boss] = [onPlayer.mock.calls.length, onBoss.mock.calls.length];
    act(t);
    drill.tickTo(t);
    played.push(...onPlayer.mock.calls.slice(player).map(([spotAnim]): [number, string, number] => [t, "player", spotAnim.id]));
    played.push(...onBoss.mock.calls.slice(boss).map(([spotAnim]): [number, string, number] => [t, "boss", spotAnim.id]));
  }
  drill.dispose();
  return played;
}

describe("timing cues", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Settings._isMobileResult = null;
  });

  test('the "End..." shout plays 12490 at 5, and each flood plays 12497 as it forms, at 39 and 99', () => {
    expect(cuesThrough(100, { focus: "lifeforce-orb", drillStart: "cycle-start" }).sounds).toEqual([
      [5, "cache-sound:12490"],
      [39, "cache-sound:12497"],
      [99, "cache-sound:12497"],
    ]);
  });

  test("each explosion series warns with spotanim 4340 on the player and sound 12638 at 14 and 45, two ticks after the lifeforce hit and three before the first mark, and a drill without explosions shows no warning", () => {
    const series = { focus: "explosions" } as const;
    expect([
      spotAnimsThrough(46, startDrill({ selection: series })),
      cuesThrough(46, series).sounds.filter(([, sound]) => sound === "cache-sound:12638"),
      spotAnimsThrough(46, startDrill({ selection: { focus: "void-floor" } })),
    ]).toEqual([
      [[14, "player", 4340], [45, "player", 4340]],
      [[14, "cache-sound:12638"], [45, "cache-sound:12638"]],
      [],
    ]);
  });

  test("the inner void's lifeforce hit plays spotanim 4316 on the boss, at 12 and 72, and the outer void's at 43 and 103 plays none", () => {
    expect(spotAnimsThrough(104, startDrill({ selection: { focus: "lifeforce-orb" } }))).toEqual([[12, "boss", 4316], [72, "boss", 4316]]);
  });

  test("each hit Deflect turns away plays spotanim 4322 on the player as it lands, and a hit it lets through plays none: a scythe's three hits and a bow's shots into Deflect Melee from 29", () => {
    const attackFrom29 = (setup: "melee" | "ranged") => {
      const drill = startDrill({ seed: 4, selection: { focus: "rifts", drillStart: "cycle-start", setup } });
      return spotAnimsThrough(38, drill, (t) => {
        if (t === 29) drill.player().setAggro(drill.boss());
      });
    };
    expect([attackFrom29("melee"), attackFrom29("ranged")]).toEqual([[[31, "player", 4322], [31, "player", 4322], [31, "player", 4322]], []]);
  });

  test("the orb returning the player's HP plays sound 5281 at 24, and an orb left to expire plays none", () => {
    const returnSound = (pickUp: boolean) =>
      cuesThrough(40, { focus: "lifeforce-orb" }, (drill, t) => {
        if (pickUp && t === 13) drill.walkTo(drill.innerOrb());
      }).sounds.filter(([, sound]) => sound === "cache-sound:5281");
    expect([returnSound(true), returnSound(false)]).toEqual([[[24, "cache-sound:5281"]], []]);
  });

  test("the kill plays the boss's death, sequence 14872, with spotanims 4274, 4275 and 4276 on him, and his body stays 15 world ticks for it", () => {
    const drill = startDrill({ bossHp: 1, selection: { focus: "rifts", drillStart: "cycle-start" } });
    const boss = drill.boss();
    const sequences: number[] = [];
    boss.setAnimationListener({ animationChanged: (id) => Promise.resolve(void sequences.push(id)), modelChanged: () => undefined });
    const effects = vi.spyOn(boss, "addSpotAnim");
    drill.tickTo(4);
    drill.hit(drill.player(), boss, 1);
    drill.tickTo(5);
    let ticksAfterKill = 0;
    while (drill.region.mobs.includes(boss) && ticksAfterKill < 30) {
      drill.region.world.tickWorld();
      ticksAfterKill++;
    }
    expect({
      ended: drill.events("run-ended").map((e) => [e.at, e.reason]),
      effects: effects.mock.calls.map(([spotAnim]) => spotAnim.id),
      sequences,
      ticksAfterKill,
    }).toEqual({ ended: [[5, "kill"]], effects: [4274, 4275, 4276], sequences: [14872], ticksAfterKill: 15 });
    drill.dispose();
  });

  test("the lifeforce tell posts its chat line at 11 and 42, and a drill without the lifeforce posts none", () => {
    expect([cuesThrough(43, { focus: "lifeforce-orb" }).chat, cuesThrough(43, { focus: "explosions" }).chat]).toEqual([
      [[11, LIFEFORCE_CHAT], [42, LIFEFORCE_CHAT]],
      [],
    ]);
  });

  test.each([
    ["desktop", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"],
    ["mobile", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"],
  ])("on %s the sound toggles load checked with no saved choice, and a reload keeps a saved off and a saved on", (_, userAgent) => {
    // jsdom runs no phone browser, so the user agent the SDK reads stands in for one.
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
    Settings._isMobileResult = null;
    localStorage.removeItem(SAVED_SETTINGS);
    const toggles = (page: ReturnType<typeof loadPage>) => [page.checked("sound"), page.checked("area_sound")];
    const saved = () => {
      const { playsAudio, playsAreaAudio } = JSON.parse(localStorage.getItem(SAVED_SETTINGS) ?? "{}").values;
      return [playsAudio, playsAreaAudio];
    };
    const reloadOverStaleSettings = (stale: boolean) => {
      Settings.playsAudio = stale;
      Settings.playsAreaAudio = stale;
      return loadPage("/?seed=1");
    };

    const fresh = loadPage("/?seed=1");
    const loaded = toggles(fresh);
    fresh.click("sound");
    fresh.click("area_sound");
    const savedOff = saved();
    fresh.close();

    const off = reloadOverStaleSettings(true);
    const keptOff = toggles(off);
    off.click("sound");
    off.click("area_sound");
    const savedOn = saved();
    off.close();

    const on = reloadOverStaleSettings(false);
    const keptOn = toggles(on);
    on.close();

    expect({ loaded, savedOff, keptOff, savedOn, keptOn }).toEqual({
      loaded: [true, true],
      savedOff: [false, false],
      keptOff: [false, false],
      savedOn: [true, true],
      keptOn: [true, true],
    });
  });
});
