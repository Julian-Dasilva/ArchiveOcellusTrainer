import { act } from "react";
import { TrainerInstance } from "osrs-sdk";
import type { TrainerLoadingState } from "osrs-sdk";
import { loadPage } from "./page";

const SAVED_LOADOUTS = "archive-ocellus:loadouts";
const FILLER = "test:filler";
const JSDOM_STORAGE_QUOTA = 5_000_000;
const jsdomLocalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
const READY: TrainerLoadingState = { assetProgress: 1, assetsLoaded: 0, assetsReady: true, assetsTotal: 0, imagesReady: true, status: "ready", viewportReady: true };
const RANGED_DEFAULT_INVENTORY = [28922, 22325, 24419, 24420, 24421, 22981, 21295, 29801, 25485, 12695, 22461, 6685, 3024, 12695, 22461, 6685, 3024, 6685, 6685, 6685, 3024, 6685, 6685, 6685, 3024, 6685, 6685, 3024];

const probe = () => {
  if (!window.__archiveOcellusProbe) throw new Error("the page exposed no probe");
  return window.__archiveOcellusProbe;
};

const shown = (id: string) => document.getElementById(id)?.textContent ?? null;

describe("Saved loadouts", () => {
  const MELEE_WORN = { weapon: "scytheOfVitur", helmet: "inquisitorsGreatHelm", chest: "inquisitorsHauberk", legs: "inquisitorsPlateskirt", gloves: "ferociousGloves", cape: "infernalCape", necklace: "amuletOfRancour", feet: "avernicTreadsMax", ring: "ultorRing", ammo: "dragonArrows" };
  const BREW_FIRST = ["saradominBrew", "twistedBow", "superRestore", ...Array<null>(25).fill(null)];
  const store = (setups: unknown) => JSON.stringify({ version: 1, setups });

  beforeEach(() => {
    localStorage.clear();
    // jsdom never fires load on an <img>, so the SDK's image gate would never open.
    vi.spyOn(TrainerInstance.prototype, "load").mockImplementation(async (options) => options?.onStateChange?.(READY));
    // Each test reads the page before its first frame, and a frame left on jsdom's clock would draw after the page closes.
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(0);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    if (jsdomLocalStorage) Object.defineProperty(window, "localStorage", jsdomLocalStorage);
  });

  async function startingLoadout(url: string, stored: string | null) {
    if (stored !== null) localStorage.setItem(SAVED_LOADOUTS, stored);
    const page = loadPage(url);
    await act(() => Promise.resolve());
    const player = probe().snapshot().fight?.player;
    const { header } = probe().log();
    const result = { phase: "phase" in header ? header.phase : "p4", weapon: player?.equipped.weapon, helmet: player?.equipped.helmet, inventory: player?.inventory, note: shown("loadout_note"), start: shown("start") };
    page.close();
    return result;
  }

  test.each([
    { phase: "p4", url: "/?seed=1" },
    { phase: "p3", url: "/?seed=1&phase=p3" },
  ])("a loadout saved for the setup is worn and carried, slot for slot, at the start of a $phase run", async ({ phase, url }) => {
    vi.stubEnv("ARCHIVE_P3", "on");
    expect(await startingLoadout(url, store({ ranged: { worn: MELEE_WORN, inventory: BREW_FIRST } }))).toEqual({
      phase,
      weapon: 22325,
      helmet: 24419,
      inventory: [6685, 20997, 3024, ...Array<null>(25).fill(null)],
      note: null,
      start: "Start",
    });
  });

  test.each([
    { name: "nothing saved", stored: null },
    { name: "only another setup saved", stored: store({ melee: { worn: MELEE_WORN, inventory: BREW_FIRST } }) },
  ])("guard: with $name, a ranged run starts with the wiki loadout and no note", async ({ stored }) => {
    expect(await startingLoadout("/?seed=1", stored)).toEqual({ phase: "p4", weapon: 20997, helmet: 27235, inventory: RANGED_DEFAULT_INVENTORY, note: null, start: "Start" });
  });

  test.each([
    { name: "a store that is not JSON", stored: "{not json" },
    { name: "an unknown item", stored: store({ ranged: { worn: MELEE_WORN, inventory: ["dragonClaws", ...BREW_FIRST.slice(1)] } }) },
    { name: "27 slots", stored: store({ ranged: { worn: MELEE_WORN, inventory: BREW_FIRST.slice(1) } }) },
    { name: "a weapon in the helmet slot", stored: store({ ranged: { worn: { ...MELEE_WORN, helmet: "twistedBow" }, inventory: BREW_FIRST } }) },
    { name: "a store from another version", stored: JSON.stringify({ version: 2, setups: { ranged: { worn: MELEE_WORN, inventory: BREW_FIRST } } }) },
  ])("with $name, a ranged run starts with the wiki loadout and says the saved one could not be read", async ({ stored }) => {
    expect(await startingLoadout("/?seed=1", stored)).toEqual({
      phase: "p4",
      weapon: 20997,
      helmet: 27235,
      inventory: RANGED_DEFAULT_INVENTORY,
      note: "Your saved Ranged loadout could not be read, so this run uses the default loadout.",
      start: "Start",
    });
  });

  test("guard: storage that refuses to be read starts the wiki loadout without a note", async () => {
    const read = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key === SAVED_LOADOUTS) throw new DOMException("storage is disabled", "SecurityError");
      return read.call(this, key);
    });

    expect(await startingLoadout("/?seed=1", store({ ranged: { worn: MELEE_WORN, inventory: BREW_FIRST } }))).toEqual({ phase: "p4", weapon: 20997, helmet: 27235, inventory: RANGED_DEFAULT_INVENTORY, note: null, start: "Start" });
  });

  test("a page whose browser refuses all storage starts the wiki loadout without a note", async () => {
    localStorage.setItem(SAVED_LOADOUTS, store({ ranged: { worn: MELEE_WORN, inventory: BREW_FIRST } }));
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("storage is disabled", "SecurityError");
    });

    expect(await startingLoadout("/?seed=1", null)).toEqual({ phase: "p4", weapon: 20997, helmet: 27235, inventory: RANGED_DEFAULT_INVENTORY, note: null, start: "Start" });
  });

  test.each([
    {
      refusal: "has no storage quota left",
      refuse: () => {
        localStorage.clear();
        localStorage.setItem(FILLER, "x".repeat(JSDOM_STORAGE_QUOTA - FILLER.length));
      },
    },
    {
      refusal: "refuses every storage read",
      refuse: () =>
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
          throw new DOMException("storage access is denied", "SecurityError");
        }),
    },
    {
      refusal: "refuses every storage write",
      refuse: () =>
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
          throw new DOMException("the quota has been exceeded", "QuotaExceededError");
        }),
    },
  ])("a page whose browser $refusal opens Start with the wiki loadout and no note", async ({ refuse }) => {
    localStorage.setItem(SAVED_LOADOUTS, store({ ranged: { worn: MELEE_WORN, inventory: BREW_FIRST } }));
    refuse();

    expect(await startingLoadout("/?seed=1", null)).toEqual({ phase: "p4", weapon: 20997, helmet: 27235, inventory: RANGED_DEFAULT_INVENTORY, note: null, start: "Start" });
  });
});
