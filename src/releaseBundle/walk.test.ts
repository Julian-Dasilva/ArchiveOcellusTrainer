import { creditLines } from "../menu/credits";
import { chunkAbortProblems, chunkRetryProblems, contrastRatio, visibleCreditLines, walkProblems } from "./walk";
import type { ChunkAbortObservation, ChunkRetryObservation, WalkObservation } from "./walk";

const LINES = [
  "Made by Julian Dasilva / Moarhots: GitHub · @ShadowJdas",
  "With help from Alessandro Rodi",
] as const;

const HEALTHY_PHONE: WalkObservation = {
  surface: "phone",
  rootChildren: 1,
  errors: [],
  creditLines: LINES,
  fullFightReachable: true,
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
  fullFightReachable: false,
  worldWidth: 0,
  chatBottom: "",
  chatLine: "",
  keybindsClosed: true,
};

const ABORTED: ChunkAbortObservation = {
  surface: "desktop",
  message: true,
  reload: true,
  drillLink: true,
  creditLines: LINES,
  errors: ["ChunkLoadError: Loading chunk 61 failed"],
  reloadHeight: 24,
  backHeight: 24,
  gapPx: 12,
  reloadContrast: 9.76,
  backContrast: 9.76,
};

const RETRIED: ChunkRetryObservation = {
  loaded: true,
  navigations: 1,
  creditLines: LINES,
  errors: ["ChunkLoadError: Loading chunk 1 failed"],
  outcomes: ["503", "200"],
};

describe("release browser walk", () => {
  test("the credit lines the walk requires are the lines in credits.ts", () => {
    expect(creditLines()).toEqual([...LINES]);
  });

  test("a phone page with both credit lines, the full fight, and a chat line under the tabs passes", () => {
    expect(walkProblems(HEALTHY_PHONE)).toEqual([]);
  });

  test("the e4b47df phone crash fails", () => {
    expect(walkProblems(CRASHED_PHONE)).toEqual([
      "the page has no root",
      "page errors: TypeError: Cannot read properties of null (reading 'appearsOnLeftInMobile')",
      "Made by Julian Dasilva / Moarhots: GitHub · @ShadowJdas is not on screen",
      "With help from Alessandro Rodi is not on screen",
      "Full fight (beta) is not reachable",
      "no chat line",
      "the game is 0px wide",
      "the chat corner is missing, not under the tabs",
    ]);
  });

  test("a phone page without the maker credit fails", () => {
    expect(walkProblems({ ...HEALTHY_PHONE, creditLines: [LINES[1]] })).toEqual([`${LINES[0]} is not on screen`]);
  });

  test("a phone page without the contributor credit fails", () => {
    expect(walkProblems({ ...HEALTHY_PHONE, creditLines: [LINES[0]] })).toEqual([`${LINES[1]} is not on screen`]);
  });

  test("a phone page that leaves the menu open after Keybinds fails", () => {
    expect(walkProblems({ ...HEALTHY_PHONE, keybindsClosed: false })).toEqual(["Keybinds leaves the menu open"]);
  });

  test("a desktop page that stays up after a chat line passes", () => {
    expect(walkProblems({ ...HEALTHY_PHONE, surface: "desktop", worldWidth: 1040, chatBottom: "76px" })).toEqual([]);
  });

  test("an aborted full-fight chunk passes when the message, the reload, the drill link, and both credit lines stay up", () => {
    expect(chunkAbortProblems(ABORTED)).toEqual([]);
    expect(chunkAbortProblems({ ...ABORTED, surface: "phone", errors: ["Loading chunk 2 failed"] })).toEqual([]);
  });

  test("an aborted full-fight chunk that hides the contributor credit fails", () => {
    expect(chunkAbortProblems({ ...ABORTED, creditLines: [LINES[0]] })).toEqual([`${LINES[1]} is not on screen`]);
  });

  test("an aborted full-fight chunk that stays blank fails", () => {
    expect(chunkAbortProblems({ ...ABORTED, message: false, reload: false, drillLink: false, creditLines: [], errors: ["TypeError: broke"], reloadHeight: 0, backHeight: 0, gapPx: 0, reloadContrast: 1, backContrast: 1 })).toEqual([
      "the full fight failure message is not on screen",
      "Reload is not on screen",
      "the link back to the drill is not on screen",
      "Reload is 0px tall",
      "Back to the drill is 0px tall",
      "Reload and Back to the drill are 0px apart",
      "Reload contrast is 1.00:1",
      "Back to the drill contrast is 1.00:1",
      `${LINES[0]} is not on screen`,
      `${LINES[1]} is not on screen`,
      "page errors: TypeError: broke",
    ]);
  });

  test("the failure controls fail when they are short, flush, or below AA contrast", () => {
    expect(chunkAbortProblems({ ...ABORTED, reloadHeight: 21, backHeight: 18, gapPx: 0, reloadContrast: 2.23, backContrast: 2.23 })).toEqual([
      "Reload is 21px tall",
      "Back to the drill is 18px tall",
      "Reload and Back to the drill are 0px apart",
      "Reload contrast is 2.23:1",
      "Back to the drill contrast is 2.23:1",
    ]);
  });

  test("one failed full-fight request then the file passes", () => {
    expect(chunkRetryProblems(RETRIED)).toEqual([]);
  });

  test("a single full-fight attempt fails the retry", () => {
    expect(chunkRetryProblems({ ...RETRIED, loaded: false, outcomes: ["503"] })).toEqual([
      "full-fight requests were 503, not one failure then the file",
      "one failed full-fight request did not load the fight",
    ]);
  });

  test("orange on black clears AA and the default link blue does not", () => {
    expect(Math.round((contrastRatio("rgb(255, 152, 31)", "rgb(0, 0, 0)") ?? 0) * 100) / 100).toBe(9.76);
    expect(Math.round((contrastRatio("rgb(0, 0, 238)", "rgb(0, 0, 0)") ?? 0) * 100) / 100).toBe(2.23);
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
