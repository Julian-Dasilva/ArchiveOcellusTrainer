import { FixedLayout } from "osrs-sdk";
import { FIXED_FRAME_SPRITES, spriteFile } from "./assets";

/** Loads the fixed-mode frame's cache sprites and hands each to the SDK as it arrives; a piece still loading draws as stone. */
export function loadFixedFrame(): void {
  const loaded = new Map<number, CanvasImageSource>();
  for (const archive of FIXED_FRAME_SPRITES) {
    const image = new Image();
    image.onload = () => {
      loaded.set(archive, image);
      FixedLayout.setSprites(loaded);
    };
    image.src = `osrs-assets/${spriteFile({ archive, frame: 0 })}`;
  }
}
