export type CreditLink = Readonly<{ label: string; href: string }>;

export const MAKER = "Julian Dasilva / Moarhots";
export const MAKER_LINKS: readonly CreditLink[] = [
  { label: "GitHub", href: "https://github.com/Julian-Dasilva/ArchiveOcellusTrainer" },
  { label: "@ShadowJdas", href: "https://x.com/ShadowJdas" },
];
export const CONTRIBUTOR: CreditLink = { label: "Alessandro Rodi", href: "https://x.com/alrodi" };
export const CREDIT_LINE =
  "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.";

type MakerCredit = Readonly<{ kind: "maker"; name: string; links: readonly CreditLink[] }>;
type HelperCredit = Readonly<{ kind: "helper"; link: CreditLink }>;
type CreditEntry = MakerCredit | HelperCredit;

const CREDIT_ENTRIES: readonly CreditEntry[] = [
  { kind: "maker", name: MAKER, links: MAKER_LINKS },
  { kind: "helper", link: CONTRIBUTOR },
];

function creditLineText(entry: CreditEntry): string {
  switch (entry.kind) {
    case "maker":
      return `Made by ${entry.name}: ${entry.links.map((link) => link.label).join(" · ")}`;
    case "helper":
      return `With help from ${entry.link.label}`;
    default: {
      const unhandled: never = entry;
      return unhandled;
    }
  }
}

export function creditLines(): readonly string[] {
  return CREDIT_ENTRIES.map(creditLineText);
}
