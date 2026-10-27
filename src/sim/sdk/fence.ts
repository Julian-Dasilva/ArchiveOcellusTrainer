import { InvisibleMovementBlocker } from "osrs-sdk";
import type { Entity, Region } from "osrs-sdk";
import type { RoomTile } from "../frame";
import { TileSet } from "../tiles";

/** A blocker on every tile beside the floor and off it, so the SDK paths only across the floor. */
export function fence(region: Region, floor: readonly RoomTile[]): readonly Entity[] {
  const posts = TileSet.at(floor).surround().tiles().map((edge) => new InvisibleMovementBlocker(region, { ...edge }));
  posts.forEach((post) => region.addEntity(post));
  return posts;
}
