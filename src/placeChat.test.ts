import { chatCornerBottom } from "./placeChat";

const area = { left: 0, top: 0, right: 150, bottom: 798 };

describe("chatCornerBottom", () => {
  test("sits just above the inventory when the chat shares its columns, and stays at the bottom when it does not", () => {
    expect(chatCornerBottom(area, { left: 4, top: 700, right: 146, bottom: 794 }, { left: -8, top: 475, right: 160, bottom: 790 })).toBe(327);
    expect(chatCornerBottom(
      { left: 0, top: 0, right: 1040, bottom: 780 },
      { left: 4, top: 700, right: 420, bottom: 776 },
      { left: 852, top: 457, right: 1039, bottom: 776 },
    )).toBe(4);
    expect(chatCornerBottom(
      { left: 0, top: 0, right: 100, bottom: 100 },
      { left: 0, top: 50, right: 80, bottom: 90 },
      { left: 0, top: 10, right: 100, bottom: 100 },
    )).toBe(60);
  });
});
