export const DISPLAY = "Display";
export const SECTIONS = ["Fight", DISPLAY, "Sound", "About"];

export function position(name: string): number {
  const index = SECTIONS.indexOf(name);
  if (index < 0) throw new Error(`no section ${name}`);
  return index;
}

export function problems(sections: readonly string[]): string[] {
  return [
    ...SECTIONS.filter((name) => !sections.includes(name)).map((name) => `${name} is missing`),
    ...sections.filter((name) => !SECTIONS.includes(name)).map((name) => `${name} is not a section`),
  ];
}
