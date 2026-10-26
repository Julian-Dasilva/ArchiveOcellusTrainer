import { InvisibleMovementBlocker } from "osrs-sdk";
import type { Region } from "osrs-sdk";
import { OCELLUS_P4 } from "../OcellusTimings";
import type { Tile } from "../../../../sim/brands";
import { Brazier, Walkway } from "../entities/Scenery";
import { BRAZIERS, CURB, PLATFORM } from "../p4/floor";

export const PLATFORM_ROOM = {
  size: PLATFORM.extent(),
  spawn: OCELLUS_P4.geometry.playerSpawn.value,
  drawFloor(context: OffscreenCanvasRenderingContext2D, scale: number): void {
    const floor = ({ x, y }: Tile) => ((x + y) % 2 === 0 ? "#4a4339" : "#3f392f");
    const { top } = OCELLUS_P4.geometry.walkway.value;
    for (const at of PLATFORM.tiles()) {
      context.fillStyle = floor(at);
      context.fillRect(at.x * scale, at.y * scale, scale, scale);
    }
    for (const curb of CURB) {
      const { x, y } = curb.at;
      switch (curb.shape) {
        case "square":
          context.fillStyle = top;
          context.fillRect(x * scale, y * scale, scale, scale);
          break;
        case "diagonal": {
          context.fillStyle = floor(curb.at);
          context.fillRect(x * scale, y * scale, scale, scale);
          const [from, to] = curb.cut;
          context.fillStyle = top;
          context.beginPath();
          context.moveTo(from.x * scale, from.y * scale);
          context.lineTo(curb.wallCorner.x * scale, curb.wallCorner.y * scale);
          context.lineTo(to.x * scale, to.y * scale);
          context.closePath();
          context.fill();
          break;
        }
        default: {
          const unhandled: never = curb;
          return unhandled;
        }
      }
    }
  },

  mount(region: Region): void {
    [new Walkway(region), ...BRAZIERS.tiles().map((at) => new Brazier(region, at))].forEach((scenery) => region.addEntity(scenery));
    for (const edge of PLATFORM.surround().tiles()) region.addEntity(new InvisibleMovementBlocker(region, { ...edge }));
  },
};
