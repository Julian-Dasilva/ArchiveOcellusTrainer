import { loadAttempts } from "./loadAttempts";

describe("loadAttempts", () => {
  test("returns the value when the third try is the first success", async () => {
    const seen: string[] = [];
    const load = () => {
      seen.push("try");
      if (seen.length < 3) return Promise.reject(new Error("missing"));
      return Promise.resolve("full-fight");
    };

    await expect(loadAttempts(3, load)).resolves.toBe("full-fight");
    expect(seen).toEqual(["try", "try", "try"]);
  });

  test("rejects with the load error after three failures and does not try again", async () => {
    const seen: string[] = [];
    const load = () => {
      seen.push("try");
      return Promise.reject(new Error("missing"));
    };

    await expect(loadAttempts(3, load)).rejects.toThrow("missing");
    expect(seen).toEqual(["try", "try", "try"]);
  });
});
