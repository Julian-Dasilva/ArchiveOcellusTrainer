/** `log-repeated`: seen in more than one fight log, the game's own events by tick as a client recorded them. */
export type Basis = "log-repeated" | "footage-repeated" | "footage-once" | "spec-confirmed" | "spec-single" | "community-tested" | "owner-estimated" | "inferred" | "assumption";

export type WikiRef = Readonly<{ kind: "wiki"; page: string; oldid: number | null }>;
export type NoWiki = Readonly<{ kind: "no-wiki"; why: string }>;

export type Citations<Source> = readonly [WikiRef, ...(WikiRef | Source)[]] | readonly [NoWiki, ...Source[]];

export type Evidence<Source, Scale extends string> = Readonly<{
  status: "unverified";
  basis: Basis;
  scale: Scale;
  note: string;
  sources: Citations<Source>;
}>;

export function wiki(page: string, oldid: number | null): WikiRef {
  return { kind: "wiki", page, oldid };
}

export function noWiki(why: string): NoWiki {
  return { kind: "no-wiki", why };
}
