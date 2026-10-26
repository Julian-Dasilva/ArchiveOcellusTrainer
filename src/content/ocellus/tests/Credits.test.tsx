import { loadPage } from "./page";

beforeEach(() => localStorage.removeItem("osrs-sdk:settings"));
afterEach(() => vi.unstubAllEnvs());

const LINK = { target: "_blank", rel: "noopener noreferrer" };

const WITH_COMING_SOON = { order: ["coming_soon", "maker_credit", "credit_line", "app_version"], comingSoon: "Phases 1 to 3 coming soon." };
const WITHOUT_COMING_SOON = { order: ["maker_credit", "credit_line", "app_version"], comingSoon: null };

test.each([
  { p2: "off", p3: "off", ...WITH_COMING_SOON },
  { p2: "on", p3: "off", ...WITHOUT_COMING_SOON },
  { p2: "off", p3: "on", ...WITHOUT_COMING_SOON },
])("with ARCHIVE_P2 $p2 and ARCHIVE_P3 $p3, the footer credits the makers and Alessandro Rodi with links that open in a new tab above the unchanged Jagex credit line, and says the other phases are coming soon only while no phase flag is on", ({ p2, p3, order, comingSoon }) => {
  vi.stubEnv("ARCHIVE_P2", p2);
  vi.stubEnv("ARCHIVE_P3", p3);
  const page = loadPage("/?seed=1");
  const maker = page.element("maker_credit");
  const footer = {
    comingSoon: document.getElementById("coming_soon")?.textContent ?? null,
    maker: maker.textContent,
    links: [...maker.querySelectorAll("a")].map((link) => ({ text: link.textContent, href: link.href, target: link.target, rel: link.rel })),
    jagex: page.element("credit_line").textContent,
    order: [...page.element("credits").children].map((child) => child.id),
  };
  page.close();

  expect(footer).toEqual({
    comingSoon,
    maker: "Made by Julian Dasilva / Moarhots GitHub · @ShadowJdasWith help from Alessandro Rodi",
    links: [
      { text: "GitHub", href: "https://github.com/Julian-Dasilva/ArchiveOcellusTrainer", ...LINK },
      { text: "@ShadowJdas", href: "https://x.com/ShadowJdas", ...LINK },
      { text: "Alessandro Rodi", href: "https://github.com/alessandrorodi", ...LINK },
    ],
    jagex: "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.",
    order,
  });
});
