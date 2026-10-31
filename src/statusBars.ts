import { ControlPanelController, ImageLoader, Settings, Trainer } from "osrs-sdk";
import type { Player } from "osrs-sdk";
import type { SpriteFrame } from "./content/ocellus/js/OcellusTimings";
import { spriteFile, STATUS_BAR_SPRITES } from "./servedAssets";

// RuneLite's Status Bars plugin: Hitpoints and Prayer bars down the left of the open side panel.
// Sizes and colours are from the plugin's BarRenderer and StatusBarsOverlay.
const STATUS_BARS_KEY = "archive-ocellus:status-bars";
const BAR = { width: 20, gap: 8, panelGap: 6, border: 1, iconTop: 4, counterTop: 35 } as const;
const PANEL_HEIGHT = 275;
const BACKGROUND = "rgba(0, 0, 0, 0.59)";
const HEALTH = "rgba(225, 35, 0, 0.49)";
const PRAYER = "rgba(50, 200, 200, 0.69)";
const PRAYER_ACTIVE = "rgba(57, 255, 186, 0.88)";

type Bar = {
  readonly icon: HTMLImageElement;
  readonly current: (player: Player) => number;
  readonly max: (player: Player) => number;
  readonly colour: (player: Player) => string;
  counted: number;
  counter: string;
};

let enabled: boolean | null = null;
const listeners = new Set<() => void>();

export function statusBarsEnabled(): boolean {
  enabled ??= readSaved();
  return enabled;
}

/** Takes effect on the next frame. The choice is saved in the browser. */
export function setStatusBarsEnabled(on: boolean): void {
  enabled = on;
  try {
    if (on) localStorage.setItem(STATUS_BARS_KEY, "on");
    else localStorage.removeItem(STATUS_BARS_KEY);
  } catch {}
  listeners.forEach((listener) => listener());
}

export function subscribeStatusBars(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readSaved(): boolean {
  try {
    return localStorage.getItem(STATUS_BARS_KEY) === "on";
  } catch {
    return false;
  }
}

function anyPrayerActive(player: Player): boolean {
  const { prayers } = player.prayerController;
  for (let i = 0; i < prayers.length; i++) if (prayers[i].isActive) return true;
  return false;
}

const makeBar = (sprite: SpriteFrame, current: Bar["current"], max: Bar["max"], colour: Bar["colour"]): Bar => ({
  icon: ImageLoader.createImage(`osrs-assets/${spriteFile(sprite)}`),
  current,
  max,
  colour,
  counted: -1,
  counter: "",
});

function drawBar(context: CanvasRenderingContext2D, shown: Bar, player: Player, x: number, y: number, width: number, height: number, scale: number): void {
  const border = BAR.border * scale;
  const current = shown.current(player);
  // Above max, the bar stays full and the counter shows the overheal.
  const filled = Math.round(height * Math.max(0, Math.min(1, current / Math.max(1, shown.max(player)))));
  context.fillStyle = BACKGROUND;
  context.fillRect(x, y, width, height);
  context.fillStyle = shown.colour(player);
  context.fillRect(x + border, y + border + (height - filled), width - border * 2, Math.max(0, filled - border * 2));

  const { icon } = shown;
  if (icon.complete && icon.naturalWidth > 0) {
    const iconWidth = Math.min(icon.naturalWidth * scale, width - 2 * border);
    context.drawImage(icon, x + width / 2 - iconWidth / 2, y + BAR.iconTop * scale, iconWidth, (icon.naturalHeight / icon.naturalWidth) * iconWidth);
  }
  if (shown.counted !== current) {
    shown.counted = current;
    shown.counter = String(current);
  }
  context.fillStyle = "#000";
  context.fillText(shown.counter, x + width / 2 + scale, y + BAR.counterTop * scale + scale);
  context.fillStyle = "#fff";
  context.fillText(shown.counter, x + width / 2, y + BAR.counterTop * scale);
}

function phoneLayout(): boolean {
  const mobile: unknown = Settings.mobileCheck();
  return mobile === true;
}

let installed = false;

/** Draws the bars beside each side panel tab as the SDK draws it. Fixed mode and a phone have no room beside the panel, so only the resizable desktop layout draws them. */
export function installStatusBars(): void {
  if (installed) return;
  installed = true;
  const bars = [
    makeBar(STATUS_BAR_SPRITES.hitpoints, (player) => player.currentStats.hitpoint, (player) => player.stats.hitpoint, () => HEALTH),
    makeBar(STATUS_BAR_SPRITES.prayer, (player) => player.currentStats.prayer ?? 0, (player) => player.stats.prayer ?? 1, (player) => (anyPrayerActive(player) ? PRAYER_ACTIVE : PRAYER)),
  ];
  let fontScale = 0;
  let font = "";
  for (const control of new Set(ControlPanelController.controller.controls)) {
    const drawPanel = control.draw.bind(control);
    control.draw = (context, controller, x, y) => {
      drawPanel(context, controller, x, y);
      if (!statusBarsEnabled() || phoneLayout() || Settings.fixedMode) return;
      const scale = Settings.controlPanelScale;
      if (scale !== fontScale) {
        fontScale = scale;
        font = `${Math.round(12 * scale)}px OSRS`;
      }
      const player = Trainer.player;
      const width = BAR.width * scale;
      const height = PANEL_HEIGHT * scale;
      const right = x - BAR.panelGap * scale;
      context.font = font;
      context.textAlign = "center";
      context.textBaseline = "alphabetic";
      for (let index = 0; index < bars.length; index++) {
        drawBar(context, bars[index], player, right - (bars.length - index) * width - (bars.length - 1 - index) * BAR.gap * scale, y, width, height, scale);
      }
      context.textAlign = "left";
    };
  }
}
