import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { ControlPanelController } from "osrs-sdk";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
  return new DOMRect(left, top, right - left, bottom - top);
}

// jsdom's offsetParent is always null, so the hook would return before it measured.
function stubOffsetParent() {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.id === "hud_corner" ? this.parentElement : null;
    },
  });
}

function ChatLine({ text, keep }: Readonly<{ text: string; keep: (transcript: string) => void }>) {
  keep(text);
  return (
    <div id="play" style={{ position: "relative" }}>
      <canvas id="world" />
      <div id="hud_corner" style={{ position: "absolute" }}>
        <ol id="game_chat">
          <li>{text}</li>
        </ol>
      </div>
    </div>
  );
}

async function placeOn(userAgent: string) {
  vi.resetModules();
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  const sdk = await import("osrs-sdk");
  sdk.Settings._isMobileResult = null;
  sdk.Settings.readFromStorage();
  const { useKeepChatAboveInventory } = await import("./placeChat");
  return { sdk, keep: useKeepChatAboveInventory };
}

function mount(text: string, keep: (transcript: string) => void) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<ChatLine text={text} keep={keep} />));
  const corner = container.querySelector<HTMLElement>("#hud_corner");
  if (!corner) throw new Error("the page has no #hud_corner");
  return {
    corner,
    close: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function closePanel(controller: ControlPanelController) {
  Reflect.set(controller, "selectedControl", null);
}

describe("chat above a closed side panel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  test("a phone that closes the open tab keeps the chat line on the page", async () => {
    stubOffsetParent();
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.id === "world" || this.id === "play") return rect(0, 0, 390, 844);
      if (this.id === "hud_corner") return rect(4, 760, 150, 840);
      return new DOMRect();
    });
    const { sdk, keep } = await placeOn(PHONE);
    closePanel(sdk.ControlPanelController.controller);
    const page = mount("The void consumes you.", keep);
    expect(page.corner.style.bottom).toBe("4px");
    page.close();
  });

  test("closing the panel drops the chat back down", async () => {
    stubOffsetParent();
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.id === "world" || this.id === "play") return rect(0, 0, 320, 800);
      if (this.id === "hud_corner") return rect(4, 720, 300, 790);
      return new DOMRect();
    });
    const { sdk, keep } = await placeOn(DESKTOP);
    sdk.ControlPanelController.controller.setActiveControl("PRAYER");
    const page = mount("The void consumes you.", keep);
    const lifted = page.corner.style.bottom;
    closePanel(sdk.ControlPanelController.controller);
    act(() => window.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect({ lifted, dropped: page.corner.style.bottom }).toEqual({ lifted: "327px", dropped: "76px" });
    page.close();
  });

  test("fixed mode puts the chat lines inside the frame's chatbox, scaled with the frame", async () => {
    stubOffsetParent();
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.id === "play") return rect(0, 0, 1550, 1050);
      if (this.id === "world") return rect(10, 20, 1540, 1026);
      if (this.id === "hud_corner") return rect(28, 900, 300, 962);
      return new DOMRect();
    });
    const { sdk, keep } = await placeOn(DESKTOP);
    sdk.Settings.fixedMode = true;
    const page = mount("Ocellus manipulates your lifeforce!", keep);
    const { left, bottom, fontSize } = page.corner.style;
    const fixed = { left, bottom, fontSize, inChatbox: page.corner.classList.contains("fixed_chatbox") };
    sdk.Settings.fixedMode = false;
    act(() => window.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect({ fixed, resizable: { left: page.corner.style.left, inChatbox: page.corner.classList.contains("fixed_chatbox") } }).toEqual({
      fixed: { left: "28px", bottom: "88px", fontSize: "24px", inChatbox: true },
      resizable: { left: "", inChatbox: false },
    });
    page.close();
  });

  test("fixed mode gives the dialogs the game view's box, and turning it off takes the box away", async () => {
    stubOffsetParent();
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.id === "play") return rect(0, 0, 1550, 1050);
      if (this.id === "world") return rect(10, 20, 1540, 1026);
      if (this.id === "hud_corner") return rect(28, 900, 300, 962);
      return new DOMRect();
    });
    const { sdk, keep } = await placeOn(DESKTOP);
    sdk.Settings.fixedMode = true;
    const page = mount("Ocellus manipulates your lifeforce!", keep);
    const area = page.corner.parentElement;
    if (!area) throw new Error("the chat corner has no playable area");
    const box = () => ({
      marked: area.classList.contains("fixed_game_view"),
      left: area.style.getPropertyValue("--game-view-left"),
      top: area.style.getPropertyValue("--game-view-top"),
      width: area.style.getPropertyValue("--game-view-width"),
      height: area.style.getPropertyValue("--game-view-height"),
    });
    const fixed = box();
    act(() => sdk.Settings.set({ fixedMode: false }));
    expect({ fixed, resizable: box() }).toEqual({
      fixed: { marked: true, left: "18px", top: "28px", width: "1024px", height: "668px" },
      resizable: { marked: false, left: "", top: "", width: "", height: "" },
    });
    page.close();
  });
});
