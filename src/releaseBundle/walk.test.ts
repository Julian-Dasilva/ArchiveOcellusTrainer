import { creditLines } from "../menu/credits";
import { chunkAbortProblems, walkProblems } from "./walk";
import type { ChunkAbortObservation, WalkObservation } from "./walk";

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
    expect(chunkAbortProblems({ ...ABORTED, message: false, reload: false, drillLink: false, creditLines: [], errors: ["TypeError: broke"] })).toEqual([
      "the full fight failure message is not on screen",
      "Reload is not on screen",
      "the link back to the drill is not on screen",
      `${LINES[0]} is not on screen`,
      `${LINES[1]} is not on screen`,
      "page errors: TypeError: broke",
    ]);
  });
});
