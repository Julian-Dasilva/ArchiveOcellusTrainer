export type BuildFlags = Readonly<{ p3: boolean; p2: boolean }>;

/** webpack's EnvironmentPlugin writes ARCHIVE_P3 and ARCHIVE_P2 into the bundle at build time, "off" unless the build environment sets them. */
export function readBuildFlags(): BuildFlags {
  return { p3: process.env.ARCHIVE_P3 === "on", p2: process.env.ARCHIVE_P2 === "on" };
}

export const onlyP4Playable = (flags: BuildFlags): boolean => !Object.values(flags).includes(true);
