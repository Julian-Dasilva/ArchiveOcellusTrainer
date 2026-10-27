export type CreditLink = Readonly<{ label: string; href: string }>;

export const MAKER = "Julian Dasilva / Moarhots";
export const MAKER_LINKS: readonly CreditLink[] = [
  { label: "GitHub", href: "https://github.com/Julian-Dasilva/ArchiveOcellusTrainer" },
  { label: "@ShadowJdas", href: "https://x.com/ShadowJdas" },
];
export const CONTRIBUTOR: CreditLink = { label: "Alessandro Rodi", href: "https://x.com/alrodi" };
export const CREDIT_LINE =
  "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.";
