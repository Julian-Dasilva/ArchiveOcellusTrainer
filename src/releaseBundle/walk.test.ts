import { creditLines } from "../menu/credits";
import { oldLinkProblems, visibleCreditLines, walkProblems } from "./walk";
import type { WalkObservation } from "./walk";

const LINES = [
  "Made by Julian Dasilva / Moarhots: GitHub · @ShadowJdas",
  "With help from Alessandro Rodi",
] as const;

const RELEASE_START_WITH = ["Twisted bow (Masori)", "Toxic blowpipe (Masori)", "Scythe (Inquisitor's)"];

const HEALTHY_PHONE: WalkObservation = {
  surface: "phone",
  rootChildren: 1,
  errors: [],
  creditLines: LINES,
  startPhase: "4",
  phases: ["1", "2", "3", "4"],
  sections: ["Fight", "Learning aids", "Display", "Sound", "Controls", "About"],
  aboutReachable: true,
  retiredToggles: [],
  loadoutButton: false,
  tierPicker: false,
  startWith: RELEASE_START_WITH,
  startWeapon: "Twisted bow (Masori)",
  worldWidth: 390,
  chatBottom: "4px",
  chatLine: "Ocellus manipulates your lifeforce!",
  keybindsClosed: true,
};

const CRASHED_PHONE: WalkObservation = {
  surface: "phone",
  rootChildren: 0,
  errors: ["TypeError: Cannot read properties of null (reading 'appearsOnLeftInMobile')"],
  creditLines: [],
  startPhase: "",
  phases: [],
  sections: [],
  aboutReachable: false,
  retiredToggles: [],
  loadoutButton: false,
  tierPicker: false,
  startWith: [],
  startWeapon: "",
  worldWidth: 0,
  chatBottom: "",
  chatLine: "",
  keybindsClosed: true,
};

describe("release browser walk", () => {
  test("the credit lines the walk requires are the lines in credits.ts", () => {
    expect(creditLines()).toEqual([...LINES]);
  });

  test("a phone page at phase 4 with every phase, the five sections, About at the bottom, both credit lines, and a chat line under the tabs passes", () => {
    expect(walkProblems(HEALTHY_PHONE)).toEqual([]);
    const without = [{ startPhase: "1" }, { phases: ["1", "2", "4"] }, { sections: ["Fight", "Sound"] }, { aboutReachable: false }, { creditLines: [LINES[0]] }, { chatLine: "" }, { chatBottom: "76px" }];
    expect(without.map((change) => walkProblems({ ...HEALTHY_PHONE, ...change }).length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  test("the e4b47df phone crash fails", () => {
    expect(walkProblems(CRASHED_PHONE)).toEqual([
      "the page has no root",
      "page errors: TypeError: Cannot read properties of null (reading 'appearsOnLeftInMobile')",
      "Made by Julian Dasilva / Moarhots: GitHub · @ShadowJdas is not on screen",
      "With help from Alessandro Rodi is not on screen",
      "Start at is missing, not phase 4",
      "Start at offers nothing, not phases 1 to 4",
      "the panel's sections are , not Fight, Learning aids, Display, Sound, Controls, About",
      "Performance data and What's new are not reachable at the bottom of the panel",
      "Start with offers nothing, not Twisted bow (Masori), Toxic blowpipe (Masori), Scythe (Inquisitor's)",
      "Start with is nothing, not Twisted bow (Masori)",
      "no chat line",
      "the game is 0px wide",
      "the chat corner is missing, not under the tabs",
    ]);
  });

  test("a page that opens at phase 1, hides phase 3 or puts About first fails", () => {
    expect(walkProblems({ ...HEALTHY_PHONE, startPhase: "1", phases: ["1", "2", "4"], sections: ["About", "Fight", "Learning aids", "Display", "Sound", "Controls"] })).toEqual([
      "Start at is phase 1, not phase 4",
      "Start at offers 1, 2, 4, not phases 1 to 4",
      "the panel's sections are About, Fight, Learning aids, Display, Sound, Controls, not Fight, Learning aids, Display, Sound, Controls, About",
    ]);
  });

  test("with no Full fight toggle to reach, a phone page without the maker credit fails on that line alone", () => {
    const page = { ...HEALTHY_PHONE, creditLines: [LINES[1]] };
    expect(walkProblems(page)).toEqual([`${LINES[0]} is not on screen`]);
    expect(walkProblems({ ...page, retiredToggles: ["Full fight (beta)"] })).toEqual([`${LINES[0]} is not on screen`, "Full fight (beta) is still on the page"]);
  });

  test("with no Full fight toggle to reach, a phone page without the contributor credit fails on that line alone", () => {
    const page = { ...HEALTHY_PHONE, creditLines: [LINES[0]] };
    expect(walkProblems(page)).toEqual([`${LINES[1]} is not on screen`]);
    expect(walkProblems({ ...page, retiredToggles: ["Full fight (beta)"] })).toEqual([`${LINES[1]} is not on screen`, "Full fight (beta) is still on the page"]);
  });

  test("with no Full fight toggle to reach, a phone page that leaves the menu open after Keybinds fails on that alone", () => {
    const page = { ...HEALTHY_PHONE, keybindsClosed: false };
    expect(walkProblems(page)).toEqual(["Keybinds leaves the menu open"]);
    expect(walkProblems({ ...page, retiredToggles: ["Phase 4 drill"] })).toEqual(["Phase 4 drill is still on the page", "Keybinds leaves the menu open"]);
  });

  test("with no Full fight toggle to reach, a desktop page that stays up after a chat line passes", () => {
    const page: WalkObservation = { ...HEALTHY_PHONE, surface: "desktop", worldWidth: 1040, chatBottom: "76px" };
    expect(walkProblems(page)).toEqual([]);
    expect(walkProblems({ ...page, retiredToggles: ["Phase 4 drill", "Full fight (beta)"] })).toEqual(["Phase 4 drill is still on the page", "Full fight (beta) is still on the page"]);
  });

  test("a release page that shows the Loadout button fails on that alone", () => {
    expect(walkProblems({ ...HEALTHY_PHONE, loadoutButton: true })).toEqual(["the Loadout button is on the release page"]);
  });

  test("a release page with the Tier picker, or a Start with other than 2026.10.28's with the twisted bow chosen, fails on that alone", () => {
    expect(walkProblems({ ...HEALTHY_PHONE, tierPicker: true })).toEqual(["the Tier picker is on the release page"]);
    expect(walkProblems({ ...HEALTHY_PHONE, startWith: ["Twisted bow (Masori)", "Toxic blowpipe (Masori)", "Tonalztics of Ralos (Inquisitor's)"] })).toEqual([
      "Start with offers Twisted bow (Masori), Toxic blowpipe (Masori), Tonalztics of Ralos (Inquisitor's), not Twisted bow (Masori), Toxic blowpipe (Masori), Scythe (Inquisitor's)",
    ]);
    expect(walkProblems({ ...HEALTHY_PHONE, startWeapon: "Toxic blowpipe (Masori)" })).toEqual(["Start with is Toxic blowpipe (Masori), not Twisted bow (Masori)"]);
  });

  test("a tier link must start on the default gear", () => {
    const raid = { startPhase: "4", errors: [], startWith: RELEASE_START_WITH, startWeapon: "Twisted bow (Masori)" };
    expect(oldLinkProblems("?seed=1&tier=max&weapon=ralos", raid)).toEqual([]);
    expect(oldLinkProblems("?seed=1&tier=max&weapon=ralos", { ...raid, startWith: ["Twisted bow (Masori)", "Toxic blowpipe (Masori)", "Tonalztics of Ralos (Inquisitor's)"], startWeapon: "Tonalztics of Ralos (Inquisitor's)" })).toEqual([
      "?seed=1&tier=max&weapon=ralos Start with offers Twisted bow (Masori), Toxic blowpipe (Masori), Tonalztics of Ralos (Inquisitor's), not Twisted bow (Masori), Toxic blowpipe (Masori), Scythe (Inquisitor's)",
      "?seed=1&tier=max&weapon=ralos Start with is Tonalztics of Ralos (Inquisitor's), not Twisted bow (Masori)",
    ]);
  });

  test("an old drill link must open phase 4 and an old full-fight link keeps its phase", () => {
    const raid = { startWith: RELEASE_START_WITH, startWeapon: "Twisted bow (Masori)" };
    expect(oldLinkProblems("?seed=1&invincible=on", { ...raid, startPhase: "4", errors: [] })).toEqual([]);
    expect(oldLinkProblems("?mode=full&phase=1", { ...raid, startPhase: "1", errors: [] })).toEqual([]);
    expect(oldLinkProblems("?phase=p3&seed=1", { ...raid, startPhase: "1", errors: ["TypeError: broke"] })).toEqual([
      "?phase=p3&seed=1 opens Start at phase 1, not phase 4",
      "?phase=p3&seed=1 page errors: TypeError: broke",
    ]);
  });

  test("a credit line covered at its centre is not on screen, and its own link is", () => {
    document.body.innerHTML = '<ul id="policy_footer"><li id="sidebar_contributor">With help from <a href="https://x.com/alrodi">Alessandro Rodi</a></li></ul><div id="cover"></div>';
    const line = document.getElementById("sidebar_contributor");
    const link = line?.querySelector("a");
    const cover = document.getElementById("cover");
    if (!(line instanceof HTMLElement) || !(link instanceof HTMLAnchorElement) || !(cover instanceof HTMLElement)) throw new Error("the credit fixture is missing");
    const box = { x: 10, y: 20, left: 10, top: 20, right: 200, bottom: 44, width: 190, height: 24, toJSON: () => ({}) };
    line.getBoundingClientRect = () => box;
    line.checkVisibility = () => true;
    let top: Element = cover;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => top });
    top = cover;
    expect(visibleCreditLines(document)).toEqual([]);
    top = link;
    expect(visibleCreditLines(document)).toEqual(["With help from Alessandro Rodi"]);
    document.body.innerHTML = "";
  });
});
