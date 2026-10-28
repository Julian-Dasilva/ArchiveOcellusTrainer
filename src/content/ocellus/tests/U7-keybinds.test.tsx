import { act } from "react";
import { ControlPanelController, Settings, SettingsControls } from "osrs-sdk";
import { loadPage } from "./page";

const SAVED_SETTINGS = "osrs-sdk:settings";

function openTab(): string | null {
  const { controls, controller } = ControlPanelController;
  return Object.entries(controls).find(([, control]) => control === controller.selectedControl)?.[0] ?? null;
}

function savedKey(): unknown {
  return JSON.parse(localStorage.getItem(SAVED_SETTINGS) ?? "{}").values?.inventory_key;
}

// SettingsControls ignores tab keys until 20 ms after a key is bound.
const bindingSettled = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("U7 key bindings", () => {
  beforeEach(() => localStorage.setItem(SAVED_SETTINGS, JSON.stringify({ version: 1, values: { inventory_key: "F4" } })));

  test("the Keybinds button opens the key bindings, and a key bound there opens its tab after a reload", async () => {
    const first = loadPage("/");
    first.click("keybinds");
    const tabAfterButton = openTab();
    act(() => SettingsControls.instance?.startKeyBinding("inventory"));
    first.press("q");
    await bindingSettled();
    const saved = savedKey();
    first.close();

    Settings.inventory_key = "F4";
    const reloaded = loadPage("/");
    reloaded.click("keybinds");
    reloaded.press("F4");
    const tabAfterOldKey = openTab();
    reloaded.press("q");
    const tabAfterBoundKey = openTab();
    reloaded.close();

    expect({ tabAfterButton, saved, tabAfterOldKey, tabAfterBoundKey }).toEqual({ tabAfterButton: "SETTINGS", saved: "q", tabAfterOldKey: "SETTINGS", tabAfterBoundKey: "INVENTORY" });
  });

  test("a bound key pressed with the Keybinds button focused opens its tab", async () => {
    const page = loadPage("/");
    page.click("keybinds");
    act(() => SettingsControls.instance?.startKeyBinding("inventory"));
    page.press("1");
    await bindingSettled();
    page.press("1", page.element("keybinds"));
    const tabAfterButtonKey = openTab();
    page.close();

    expect(tabAfterButtonKey).toEqual("INVENTORY");
  });
});
