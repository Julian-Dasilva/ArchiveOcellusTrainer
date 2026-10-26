export type BuildFlags = Readonly<{ p3: boolean; p2: boolean; p1: boolean; full: boolean }>;

/** webpack's EnvironmentPlugin writes ARCHIVE_P3, ARCHIVE_P2, ARCHIVE_P1 and ARCHIVE_FULL into the bundle at build time, "off" unless the build environment sets them. */
export function readBuildFlags(): BuildFlags {
  return { p3: process.env.ARCHIVE_P3 === "on", p2: process.env.ARCHIVE_P2 === "on", p1: process.env.ARCHIVE_P1 === "on", full: process.env.ARCHIVE_FULL === "on" };
}

export const onlyP4Playable = (flags: BuildFlags): boolean => !Object.values(flags).includes(true);
