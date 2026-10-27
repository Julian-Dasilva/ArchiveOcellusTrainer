import { walkProblems } from "./walk";
import type { WalkObservation } from "./walk";

const HEALTHY_PHONE: WalkObservation = {
  surface: "phone",
  rootChildren: 1,
  errors: [],
  makerOnScreen: true,
  fullFightReachable: true,
  worldWidth: 390,
  chatBottom: "4px",
  chatLine: "Ocellus manipulates your lifeforce!",
};

const CRASHED_PHONE: WalkObservation = {
  surface: "phone",
  rootChildren: 0,
  errors: ["TypeError: Cannot read properties of null (reading 'appearsOnLeftInMobile')"],
  makerOnScreen: false,
  fullFightReachable: false,
  worldWidth: 0,
  chatBottom: "",
  chatLine: "",
};

describe("release browser walk", () => {
  test("a phone page with the credit, the full fight, and a chat line under the tabs passes", () => {
    expect(walkProblems(HEALTHY_PHONE)).toEqual([]);
  });

  test("the e4b47df phone crash fails", () => {
    expect(walkProblems(CRASHED_PHONE)).toEqual([
      "the page has no root",
      "page errors: TypeError: Cannot read properties of null (reading 'appearsOnLeftInMobile')",
      "the maker credit is not on screen",
      "Full fight (beta) is not reachable",
      "no chat line",
      "the game is 0px wide",
      "the chat corner is missing, not under the tabs",
    ]);
  });

  test("a phone page without the maker credit fails", () => {
    expect(walkProblems({ ...HEALTHY_PHONE, makerOnScreen: false })).toEqual(["the maker credit is not on screen"]);
  });

  test("a desktop page that stays up after a chat line passes", () => {
    expect(walkProblems({ ...HEALTHY_PHONE, surface: "desktop", worldWidth: 1040, chatBottom: "76px" })).toEqual([]);
  });
});
