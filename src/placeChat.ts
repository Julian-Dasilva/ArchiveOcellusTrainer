import { useLayoutEffect } from "react";
import { CHATBOX, ControlPanelController, FixedLayout, Settings } from "osrs-sdk";

// The SDK draws the open panel from a 204 by 275 sprite and each tab from a 33 by 36 sprite, in canvas CSS pixels.
const PANEL_SPRITE = { width: 204, height: 275 } as const;
const TAB_SPRITE = { width: 33, height: 36 } as const;
const GAP_PX = 4;
const RESTING_BOTTOM_PX = 4;

export type Box = Readonly<{ left: number; top: number; right: number; bottom: number }>;

/** How far the chat corner sits off the bottom of the playable area so its lines stay above chrome they actually overlap. */
export function chatCornerBottom(area: Box, corner: Box, blocked: readonly Box[]): number {
  const cornerHeight = corner.bottom - corner.top;
  if (cornerHeight <= 0) return RESTING_BOTTOM_PX;
  let obstacleTop = Number.POSITIVE_INFINITY;
  for (const piece of blocked) {
    const sharesColumns = corner.left < piece.right && corner.right > piece.left;
    const overlapsVertically = corner.top < piece.bottom && corner.bottom > piece.top;
    if (!sharesColumns || !overlapsVertically) continue;
    if (piece.top < obstacleTop) obstacleTop = piece.top;
  }
  if (!Number.isFinite(obstacleTop)) return RESTING_BOTTOM_PX;
  const abovePanel = area.bottom - obstacleTop + GAP_PX;
  const room = Math.max(RESTING_BOTTOM_PX, area.bottom - area.top - cornerHeight);
  return Math.min(Math.max(RESTING_BOTTOM_PX, abovePanel), room);
}

function selectedPanel(controller: ControlPanelController): ControlPanelController["selectedControl"] | null {
  const raw: unknown = controller.selectedControl;
  if (typeof raw !== "object" || raw === null) return null;
  return controller.selectedControl;
}

function controlChrome(canvas: HTMLCanvasElement): readonly Box[] | null {
  const css = canvas.getBoundingClientRect();
  if (css.width === 0 || css.height === 0) return null;
  const controller = ControlPanelController.controller;
  const tabScale = controller.getTabScale();
  const panelScale = Settings.controlPanelScale;
  const selected = selectedPanel(controller);
  const origin = selected === null ? null : controller.controlPosition(selected);
  const tabs = controller.controls.map((_, index) => {
    const tab = controller.tabPosition(index);
    return {
      left: css.left + tab.x,
      top: css.top + tab.y,
      right: css.left + tab.x + TAB_SPRITE.width * tabScale,
      bottom: css.top + tab.y + TAB_SPRITE.height * tabScale,
    };
  });
  const panel = origin === null ? [] : [{
    left: css.left + origin.x,
    top: css.top + origin.y,
    right: css.left + origin.x + PANEL_SPRITE.width * panelScale,
    bottom: css.top + origin.y + PANEL_SPRITE.height * panelScale,
  }];
  const pieces = [...panel, ...tabs];
  return pieces.length === 0 ? null : pieces;
}

/** The chatbox's inside, in frame pixels: inside its border and above the stones along its bottom. */
const FIXED_CHAT_INSET = { left: 9, right: 9, top: 8, bottom: 32 } as const;
/** The chatbox font's size in frame pixels; the lines scale with the frame. */
const FIXED_CHAT_FONT_PX = 12;

/** Fixed mode: the chat lines fill the frame's chatbox from the bottom up, as the client's do. */
function placeInFixedChatbox(corner: HTMLElement, area: HTMLElement, canvas: HTMLCanvasElement): void {
  const areaBox = area.getBoundingClientRect();
  const frame = canvas.getBoundingClientRect();
  const scale = FixedLayout.scaleOf(frame.width);
  const left = frame.left - areaBox.left + (CHATBOX.x + FIXED_CHAT_INSET.left) * scale;
  const bottom = areaBox.bottom - (frame.top + (CHATBOX.y + CHATBOX.height - FIXED_CHAT_INSET.bottom) * scale);
  corner.style.left = `${left}px`;
  corner.style.bottom = `${bottom}px`;
  corner.style.maxWidth = `${(CHATBOX.width - FIXED_CHAT_INSET.left - FIXED_CHAT_INSET.right) * scale}px`;
  corner.style.maxHeight = `${(CHATBOX.height - FIXED_CHAT_INSET.top - FIXED_CHAT_INSET.bottom) * scale}px`;
  corner.style.overflow = "hidden";
  corner.style.fontSize = `${FIXED_CHAT_FONT_PX * scale}px`;
  corner.classList.add("fixed_chatbox");
}

function clearFixedChatbox(corner: HTMLElement): void {
  corner.style.left = "";
  corner.style.maxWidth = "";
  corner.style.maxHeight = "";
  corner.style.overflow = "";
  corner.style.fontSize = "";
  corner.classList.remove("fixed_chatbox");
}

function place(corner: HTMLElement): void {
  const area = corner.offsetParent;
  const canvas = document.getElementById("world");
  if (!(area instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) return;
  if (Settings.fixedMode) {
    placeInFixedChatbox(corner, area, canvas);
    return;
  }
  clearFixedChatbox(corner);
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
    window.addEventListener("mousedown", run);
    window.addEventListener("click", run);
    window.addEventListener("keydown", run);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", run);
      window.removeEventListener("mousedown", run);
      window.removeEventListener("click", run);
      window.removeEventListener("keydown", run);
    };
  }, [transcript]);
}
