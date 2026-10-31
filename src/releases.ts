export type ReleaseVersion = `${number}.${number}.${number}` | `${number}.${number}.${number}.${number}`;

export type ReleaseNotes =
  | readonly [string, string]
  | readonly [string, string, string]
  | readonly [string, string, string, string]
  | readonly [string, string, string, string, string];

export type Release = Readonly<{ version: ReleaseVersion; notes: ReleaseNotes }>;

/** Newest release first. Capped because the page script carries every note; drop the oldest to add one. */
export type Changelog =
  | readonly [Release]
  | readonly [Release, Release]
  | readonly [Release, Release, Release]
  | readonly [Release, Release, Release, Release]
  | readonly [Release, Release, Release, Release, Release];

export function releaseDate(version: ReleaseVersion): string {
  return version.split(".").slice(0, 3).join("-");
}
