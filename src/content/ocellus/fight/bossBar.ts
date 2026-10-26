import { Settings, Viewport } from "osrs-sdk";
import type { Region } from "osrs-sdk";
import { P1 } from "./data";
import type { Fight } from "./Fight";

const WIDTH = 300;
const HEIGHT = 50;
const TOP = 36;
const OFFSET = -60;
const PAD = 2;

/**
 * Ocellus's bar as the game draws it: "Ocellus" in teal over phase 1's own pool with the yellow meter beneath,
 * then green over red for the shared pool of phases 2 to 4.
 */
export function installBossBar(fightOf: (region: Region) => Fight | null): void {
  Object.defineProperty(Viewport.prototype, "drawBossHealthBar", {
    configurable: true,
    value(this: Viewport, region: Region, viewportWidth: number) {
      const boss = region.primaryBoss;
      if (!boss || !Settings.displayBossHealthBar) return;
      const fight = fightOf(region);
      const ctx = this.context;
      const meter = fight?.meter() ?? null;
      const width = Math.min(WIDTH, viewportWidth - 16);
      const x = Math.round(Math.max(8, Math.min((viewportWidth - width) / 2 + OFFSET, viewportWidth - width - 8)));
      const y = TOP;
      const height = HEIGHT + (meter !== null ? 12 : 0);
      const current = Math.max(0, boss.currentStats.hitpoint);
      const maximum = Math.max(1, boss.stats.hitpoint);
      const ratio = Math.min(1, current / maximum);
      const teal = fight?.barColour === "#00b4b4";

      ctx.save();
      ctx.fillStyle = "#090806";
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = "#211e18";
      ctx.fillRect(x + 4, y + 4, width - 8, height - 8);
      ctx.font = "18px Stats_11";
      ctx.textAlign = "center";
      const name = boss.mobName() === "Hooded Figure" ? "Hooded Figure" : "Ocellus";
      ctx.fillStyle = "black";
      ctx.fillText(name, x + width / 2 + 1, y + 19);
      ctx.fillStyle = "#d87532";
      ctx.fillText(name, x + width / 2, y + 18);

      const barX = x + PAD * 3;
      const barY = y + 24;
      const barWidth = width - PAD * 6;
      const barHeight = 20;
      ctx.fillStyle = "#050403";
      ctx.fillRect(barX, barY, barWidth, barHeight);
      ctx.fillStyle = teal ? "#0d3533" : "#e00000";
      ctx.fillRect(barX + PAD, barY + PAD, barWidth - PAD * 2, barHeight - PAD * 2);
      ctx.fillStyle = teal ? "#1fb5a8" : "#00d900";
      ctx.fillRect(barX + PAD, barY + PAD, Math.round((barWidth - PAD * 2) * ratio), barHeight - PAD * 2);
      const label = `${current} / ${maximum} (${(ratio * 100).toFixed(1)}%)`;
      ctx.font = "16px Stats_11";
      ctx.fillStyle = "black";
      ctx.fillText(label, x + width / 2 + 1, barY + 16);
      ctx.fillStyle = "white";
      ctx.fillText(label, x + width / 2, barY + 15);

      if (meter !== null) {
        const meterY = barY + barHeight + 3;
        ctx.fillStyle = "#050403";
        ctx.fillRect(barX, meterY, barWidth, 8);
        ctx.fillStyle = "#3a3208";
        ctx.fillRect(barX + 1, meterY + 1, barWidth - 2, 6);
        ctx.fillStyle = "#f2cf1b";
        ctx.fillRect(barX + 1, meterY + 1, Math.round((barWidth - 2) * Math.min(1, meter / P1.meterMax)), 6);
      }
      ctx.restore();
    },
  });
}
