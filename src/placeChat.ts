import { useLayoutEffect } from "react";
import { ControlPanelController, Settings } from "osrs-sdk";

// The SDK draws the open panel from a 204 by 275 sprite and each tab from a 33 by 36 sprite, in canvas CSS pixels.
const PANEL_SPRITE = { width: 204, height: 275 } as const;
const TAB_SPRITE = { width: 33, height: 36 } as const;
const GAP_PX = 4;
const RESTING_BOTTOM_PX = 4;

export type Box = Readonly<{ left: number; top: number; right: number; bottom: number }>;

/** How far the chat corner sits off the bottom of the playable area so its lines stay above the inventory. */
export function chatCornerBottom(area: Box, corner: Box, blocked: Box): number {
  const sharesColumns = corner.left < blocked.right && corner.right > blocked.left;
  const cornerHeight = corner.bottom - corner.top;
  if (!sharesColumns || cornerHeight <= 0) return RESTING_BOTTOM_PX;
  const abovePanel = area.bottom - blocked.top + GAP_PX;
  const room = Math.max(RESTING_BOTTOM_PX, area.bottom - area.top - cornerHeight);
  return Math.min(Math.max(RESTING_BOTTOM_PX, abovePanel), room);
}

function union(boxes: readonly Box[]): Box {
  return boxes.reduce((total, box) => ({
    left: Math.min(total.left, box.left),
    top: Math.min(total.top, box.top),
    right: Math.max(total.right, box.right),
    bottom: Math.max(total.bottom, box.bottom),
  }));
}

function controlChrome(canvas: HTMLCanvasElement): Box | null {
  const css = canvas.getBoundingClientRect();
  if (css.width === 0 || css.height === 0) return null;
  const controller = ControlPanelController.controller;
  const tabScale = controller.getTabScale();
  const panelScale = Settings.controlPanelScale;
  const origin = controller.controlPosition(controller.selectedControl);
  const tabs = controller.controls.map((_, index) => {
    const tab = controller.tabPosition(index);
    return {
      left: css.left + tab.x,
      top: css.top + tab.y,
      right: css.left + tab.x + TAB_SPRITE.width * tabScale,
      bottom: css.top + tab.y + TAB_SPRITE.height * tabScale,
    };
  });
  return union([
    {
      left: css.left + origin.x,
      top: css.top + origin.y,
      right: css.left + origin.x + PANEL_SPRITE.width * panelScale,
      bottom: css.top + origin.y + PANEL_SPRITE.height * panelScale,
    },
    ...tabs,
  ]);
}

function place(corner: HTMLElement): void {
  const area = corner.offsetParent;
  const canvas = document.getElementById("world");
  if (!(area instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) return;
  const blocked = controlChrome(canvas);
  const chat = corner.querySelector("#game_chat");
  if (blocked === null || !(chat instanceof HTMLElement) || chat.childElementCount === 0) {
    corner.style.bottom = "";
    return;
  }
  const bottom = chatCornerBottom(area.getBoundingClientRect(), corner.getBoundingClientRect(), blocked);
  const next = `${bottom}px`;
  if (corner.style.bottom !== next) corner.style.bottom = next;
}

export function useKeepChatAboveInventory(transcript: string): void {
  useLayoutEffect(() => {
    const corner = document.getElementById("hud_corner");
    if (!(corner instanceof HTMLElement)) return;
    const run = () => place(corner);
    run();
    const observer = new ResizeObserver(run);
    const canvas = document.getElementById("world");
    if (corner.offsetParent instanceof Element) observer.observe(corner.offsetParent);
    if (canvas instanceof Element) observer.observe(canvas);
    window.addEventListener("resize", run);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", run);
    };
  }, [transcript]);
}
