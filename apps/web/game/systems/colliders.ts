import { collidersFrom } from "./collision";
import type { AABB, BoxSpec } from "../types";

/**
 * The colliders the player tests against: static level geometry plus movable
 * ones owned by doors. A sliding door does not toggle a flag, it moves its box
 * into the wall pocket, so the opening becomes passable for the real reason.
 */
export interface ColliderSet {
  readonly list: AABB[];
  add(box: AABB): void;
  remove(box: AABB): void;
}

export function createColliderSet(boxes: readonly BoxSpec[]): ColliderSet {
  const list = collidersFrom(boxes);
  return {
    list,
    add(box) {
      if (!list.includes(box)) list.push(box);
    },
    remove(box) {
      const index = list.indexOf(box);
      if (index >= 0) list.splice(index, 1);
    },
  };
}

/** Zero sized, so it collides with nothing until something positions it. */
export function emptyCollider(): AABB {
  return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
}

export function setCollider(
  box: AABB,
  centre: readonly [number, number, number],
  size: readonly [number, number, number],
): void {
  box.minX = centre[0] - size[0] / 2;
  box.maxX = centre[0] + size[0] / 2;
  box.minY = centre[1] - size[1] / 2;
  box.maxY = centre[1] + size[1] / 2;
  box.minZ = centre[2] - size[2] / 2;
  box.maxZ = centre[2] + size[2] / 2;
}
