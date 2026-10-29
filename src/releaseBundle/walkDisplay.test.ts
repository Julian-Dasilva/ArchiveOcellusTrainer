import { creditLines } from "../menu/credits";
import { walkProblems } from "./walk";
import type { WalkObservation } from "./walk";

const WITH_DISPLAY: WalkObservation = {
  surface: "phone",
  rootChildren: 1,
  errors: [],
  creditLines: creditLines(),
  startPhase: "4",
  phases: ["1", "2", "3", "4"],
  sections: ["Fight", "Learning aids", "Display", "Sound", "Controls", "About"],
  aboutReachable: true,
  retiredToggles: [],
  worldWidth: 390,
  chatBottom: "4px",
  chatLine: "Ocellus manipulates your lifeforce!",
  keybindsClosed: true,
};

describe("release browser walk with the Display section", () => {
  test("a panel with Display after Learning aids passes", () => {
    expect(walkProblems(WITH_DISPLAY)).toEqual([]);
  });

  test("Display anywhere else, or twice, fails on the section line", () => {
    for (const sections of [
      ["Display", "Fight", "Learning aids", "Sound", "Controls", "About"],
      ["Fight", "Learning aids", "Sound", "Display", "Controls", "About"],
      ["Fight", "Learning aids", "Display", "Display", "Sound", "Controls", "About"],
    ]) {
      expect(walkProblems({ ...WITH_DISPLAY, sections })).toEqual([
        `the panel's sections are ${sections.join(", ")}, not Fight, Learning aids, Sound, Controls, About`,
      ]);
    }
  });
});
