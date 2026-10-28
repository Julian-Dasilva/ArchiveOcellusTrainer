import { creditLines } from "../menu/credits";
import { oldLinkProblems, visibleCreditLines, walkProblems } from "./walk";
import type { WalkObservation } from "./walk";

const LINES = [
  "Made by Julian Dasilva / Moarhots: GitHub · @ShadowJdas",
  "With help from Alessandro Rodi",
] as const;

const HEALTHY_PHONE: WalkObservation = {
  surface: "phone",
  rootChildren: 1,
  errors: [],
  creditLines: LINES,
  startPhase: "4",
  phases: ["1", "2", "3", "4"],
  sections: ["Fight", "Learning aids", "Sound", "Controls", "About"],
  aboutReachable: true,
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
  });

  test("the e4b47df phone crash fails", () => {
    expect(walkProblems(CRASHED_PHONE)).toEqual([
      "the page has no root",
      "page errors: TypeError: Cannot read properties of null (reading 'appearsOnLeftInMobile')",
      "Made by Julian Dasilva / Moarhots: GitHub · @ShadowJdas is not on screen",
      "With help from Alessandro Rodi is not on screen",
      "Start at is missing, not phase 4",
      "Start at offers nothing, not phases 1 to 4",
      "the panel's sections are , not Fight, Learning aids, Sound, Controls, About",
      "Performance data and What's new are not reachable at the bottom of the panel",
      "no chat line",
      "the game is 0px wide",
      "the chat corner is missing, not under the tabs",
    ]);
  });

  test("a page that opens at phase 1, hides phase 3 or puts About first fails", () => {
    expect(walkProblems({ ...HEALTHY_PHONE, startPhase: "1", phases: ["1", "2", "4"], sections: ["About", "Fight", "Learning aids", "Sound", "Controls"] })).toEqual([
      "Start at is phase 1, not phase 4",
      "Start at offers 1, 2, 4, not phases 1 to 4",
      "the panel's sections are About, Fight, Learning aids, Sound, Controls, not Fight, Learning aids, Sound, Controls, About",
    ]);
  });

  test("with no Full fight toggle to reach, a phone page without the maker credit fails on that line alone", () => {
    expect(walkProblems({ ...HEALTHY_PHONE, creditLines: [LINES[1]] })).toEqual([`${LINES[0]} is not on screen`]);
  });

  test("with no Full fight toggle to reach, a phone page without the contributor credit fails on that line alone", () => {
    expect(walkProblems({ ...HEALTHY_PHONE, creditLines: [LINES[0]] })).toEqual([`${LINES[1]} is not on screen`]);
  });

  test("with no Full fight toggle to reach, a phone page that leaves the menu open after Keybinds fails on that alone", () => {
    expect(walkProblems({ ...HEALTHY_PHONE, keybindsClosed: false })).toEqual(["Keybinds leaves the menu open"]);
  });

  test("with no Full fight toggle to reach, a desktop page that stays up after a chat line passes", () => {
    expect(walkProblems({ ...HEALTHY_PHONE, surface: "desktop", worldWidth: 1040, chatBottom: "76px" })).toEqual([]);
  });

  test("an old drill link must open phase 4 and an old full-fight link keeps its phase", () => {
    expect(oldLinkProblems("?seed=1&invincible=on", { startPhase: "4", errors: [] })).toEqual([]);
    expect(oldLinkProblems("?mode=full&phase=1", { startPhase: "1", errors: [] })).toEqual([]);
    expect(oldLinkProblems("?phase=p3&seed=1", { startPhase: "1", errors: ["TypeError: broke"] })).toEqual([
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
