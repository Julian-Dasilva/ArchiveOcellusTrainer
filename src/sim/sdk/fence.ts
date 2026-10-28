import { Collision, InvisibleMovementBlocker } from "osrs-sdk";
import type { Entity, Region } from "osrs-sdk";
import type { RoomTile } from "../frame";
import { TileSet } from "../tiles";

/** A blocker on every tile beside the floor and off it, so the SDK paths only across the floor. */
export function fence(region: Region, floor: readonly RoomTile[]): readonly Entity[] {
  const posts = TileSet.at(floor).surround().tiles().map((edge) => new InvisibleMovementBlocker(region, { ...edge }));
  posts.forEach((post) => region.addEntity(post));
  return posts;
}

/** The tiles of a room that are not the floor. A ring only contains a walk that starts inside it. */
export function seal(region: Region, floor: readonly RoomTile[]): readonly Entity[] {
  const open = new Set(floor.map((at) => `${at.x},${at.y}`));
  const posts: Entity[] = [];
  for (let x = 0; x < region.width; x++) {
    for (let y = 0; y < region.height; y++) {
      if (open.has(`${x},${y}`)) continue;
      if (Collision.collideableEntitiesAtPoint(region, x, y, 1).length > 0) continue;
      const post = new InvisibleMovementBlocker(region, { x, y });
      region.addEntity(post);
      posts.push(post);
    }
  }
  return posts;
}
