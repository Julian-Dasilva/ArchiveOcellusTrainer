export type BuildFlags = Readonly<{ p3: boolean; p1: boolean }>;

/** webpack's EnvironmentPlugin writes ARCHIVE_P3 and ARCHIVE_P1 into the bundle at build time, each "off" unless the build environment sets it. */
export function readBuildFlags(): BuildFlags {
  return { p3: process.env.ARCHIVE_P3 === "on", p1: process.env.ARCHIVE_P1 === "on" };
}
