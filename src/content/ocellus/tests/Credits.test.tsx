import { loadPage } from "./page";

beforeEach(() => localStorage.removeItem("osrs-sdk:settings"));

test("the footer credits the makers with GitHub and X links that open in a new tab, above the unchanged Jagex credit line", () => {
  const page = loadPage("/?seed=1");
  const maker = page.element("maker_credit");
  const footer = {
    maker: maker.textContent,
    links: [...maker.querySelectorAll("a")].map((link) => ({ text: link.textContent, href: link.href, target: link.target, rel: link.rel })),
    jagex: page.element("credit_line").textContent,
    order: [...page.element("credits").children].map((child) => child.id),
  };
  page.close();

  expect(footer).toEqual({
    maker: "Made by Julian Dasilva / Moarhots GitHub · @ShadowJdas",
    links: [
      { text: "GitHub", href: "https://github.com/Julian-Dasilva/ArchiveOcellusTrainer", target: "_blank", rel: "noopener noreferrer" },
      { text: "@ShadowJdas", href: "https://x.com/ShadowJdas", target: "_blank", rel: "noopener noreferrer" },
    ],
    jagex: "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.",
    order: ["maker_credit", "credit_line", "app_version"],
  });
});
