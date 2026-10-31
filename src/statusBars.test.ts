import { ControlPanelController, Player, Settings, TestRegion, Trainer } from "osrs-sdk";
import { installStatusBars, setStatusBarsEnabled } from "./statusBars";

const SAVED = "archive-ocellus:status-bars";
const PANEL = { x: 800, y: 300 };
const BAR_WIDTH = 20;
const BAR_HEIGHT = 275;

type Fill = Readonly<{ style: string; x: number; y: number; width: number; height: number }>;

// The SDK draws the panel's own art with the same context, so the bars are the fills left of the panel.
function drawPanel(): readonly Fill[] {
  const fills: Fill[] = [];
  let fillStyle = "";
  const canvas = document.createElement("canvas").getContext("2d");
  if (canvas === null) throw new Error("the test canvas has no 2d context");
  const context = new Proxy(canvas, {
    get: (target, name) => (name === "fillRect" ? (x: number, y: number, width: number, height: number) => fills.push({ style: fillStyle, x, y, width, height }) : Reflect.get(target, name)),
    set: (_, name, value) => {
      if (name === "fillStyle") fillStyle = String(value);
      return true;
    },
  });
  const controller = ControlPanelController.controller;
  controller.selectedControl.draw(context, controller, PANEL.x, PANEL.y);
  return fills.filter((fill) => fill.x < PANEL.x);
}

function player() {
  const you = new Player(new TestRegion(10, 10), { x: 1, y: 1 });
  Trainer.setPlayer(you);
  return you;
}

describe("status bars", () => {
  beforeEach(() => {
    localStorage.clear();
    Settings.readFromStorage();
    Settings.controlPanelScale = 1;
    Settings._isMobileResult = false;
    installStatusBars();
    setStatusBarsEnabled(false);
  });
  afterEach(() => {
    Settings._isMobileResult = null;
  });

  test("draw only when enabled", () => {
    player();
    expect(drawPanel()).toEqual([]);
    setStatusBarsEnabled(true);
    expect(drawPanel()).toHaveLength(4);
    setStatusBarsEnabled(false);
    expect(drawPanel()).toEqual([]);
  });

  test("are off by default and come back as saved", async () => {
    vi.resetModules();
    localStorage.clear();
    const first = await import("./statusBars");
    expect(first.statusBarsEnabled()).toBe(false);
    first.setStatusBarsEnabled(true);
    expect(localStorage.getItem(SAVED)).toBe("on");
    vi.resetModules();
    expect((await import("./statusBars")).statusBarsEnabled()).toBe(true);
    first.setStatusBarsEnabled(false);
    expect(localStorage.getItem(SAVED)).toBeNull();
  });

  test("do not draw on a phone or in fixed mode", () => {
    setStatusBarsEnabled(true);
    player();
    Settings._isMobileResult = true;
    const onPhone = drawPanel();
    Settings._isMobileResult = false;
    Settings.fixedMode = true;
    const inFixedMode = drawPanel();
    Settings.fixedMode = false;
    expect({ onPhone, inFixedMode }).toEqual({ onPhone: [], inFixedMode: [] });
  });

  test("fill current over max Hitpoints and Prayer, and stay full on overheal", () => {
    const you = player();
    setStatusBarsEnabled(true);
    const heights = () => {
      const fills = drawPanel();
      return { hitpoints: fills[1].height, prayer: fills[3].height };
    };
    // Each fill sits one pixel inside its bar, so it is two pixels shorter than the bar's share.
    you.stats.hitpoint = 100;
    you.currentStats.hitpoint = 50;
    you.stats.prayer = 60;
    you.currentStats.prayer = 30;
    expect(heights()).toEqual({ hitpoints: Math.round(BAR_HEIGHT * 0.5) - 2, prayer: Math.round(BAR_HEIGHT * 0.5) - 2 });
    you.currentStats.hitpoint = 120;
    you.currentStats.prayer = 0;
    expect(heights()).toEqual({ hitpoints: BAR_HEIGHT - 2, prayer: 0 });
    const [background, fill] = drawPanel();
    expect(background).toMatchObject({ width: BAR_WIDTH, height: BAR_HEIGHT });
    expect(fill.y).toBe(PANEL.y + 1);
  });

  test("brighten the Prayer bar while any prayer is active", () => {
    const you = player();
    setStatusBarsEnabled(true);
    const prayerColour = () => drawPanel()[3].style;
    const resting = prayerColour();
    you.prayerController.prayers[0].isActive = true;
    const active = prayerColour();
    expect(active).not.toBe(resting);
    you.prayerController.prayers[0].isActive = false;
    expect(prayerColour()).toBe(resting);
  });
});
