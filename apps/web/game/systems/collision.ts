import { PLAYER_RADIUS } from "../data/dimensions";
import type { AABB, BoxSpec, Point3 } from "../types";

/** Keeps the player a hair off surfaces so the next overlap test is clean. */
const SKIN = 1e-3;

/** Cap on distance moved between tests. Must stay under the thinnest wall. */
const MAX_SUBSTEP = 0.15;

/** Tallest ledge walked up without jumping. */
export const STEP_HEIGHT = 0.25;

export interface MoveResult {
  grounded: boolean;
  blockedX: boolean;
  blockedZ: boolean;
}

export function collidersFrom(boxes: readonly BoxSpec[]): AABB[] {
  const out: AABB[] = [];
  for (const box of boxes) {
    if (!box.collides) continue;
    const [x, y, z] = box.position;
    const [w, h, d] = box.size;
    out.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minY: y - h / 2,
      maxY: y + h / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
    });
  }
  return out;
}

// Scratch box, reused so the per-frame loop allocates nothing.
const probe: AABB = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

function setProbe(p: Point3, height: number, radius: number): void {
  probe.minX = p.x - radius;
  probe.maxX = p.x + radius;
  probe.minY = p.y;
  probe.maxY = p.y + height;
  probe.minZ = p.z - radius;
  probe.maxZ = p.z + radius;
}

function intersects(a: AABB, b: AABB): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

/** True if the player box at this position is clear of everything. */
export function isClear(
  p: Point3,
  height: number,
  colliders: readonly AABB[],
  radius = PLAYER_RADIUS,
): boolean {
  setProbe(p, height, radius);
  for (const c of colliders) if (intersects(probe, c)) return false;
  return true;
}

export function isGrounded(
  p: Point3,
  colliders: readonly AABB[],
  radius = PLAYER_RADIUS,
): boolean {
  probe.minX = p.x - radius;
  probe.maxX = p.x + radius;
  probe.minY = p.y - 0.06;
  probe.maxY = p.y - SKIN;
  probe.minZ = p.z - radius;
  probe.maxZ = p.z + radius;
  for (const c of colliders) if (intersects(probe, c)) return true;
  return false;
}

/**
 * Resolving one axis at a time is what produces wall sliding: blocking X leaves
 * the Z component of the move intact.
 */
function resolveX(p: Point3, dir: number, h: number, r: number, cs: readonly AABB[]): boolean {
  if (dir === 0) return false;
  let blocked = false;
  setProbe(p, h, r);
  for (const c of cs) {
    if (!intersects(probe, c)) continue;
    p.x = dir > 0 ? c.minX - r - SKIN : c.maxX + r + SKIN;
    blocked = true;
    setProbe(p, h, r);
  }
  return blocked;
}

function resolveZ(p: Point3, dir: number, h: number, r: number, cs: readonly AABB[]): boolean {
  if (dir === 0) return false;
  let blocked = false;
  setProbe(p, h, r);
  for (const c of cs) {
    if (!intersects(probe, c)) continue;
    p.z = dir > 0 ? c.minZ - r - SKIN : c.maxZ + r + SKIN;
    blocked = true;
    setProbe(p, h, r);
  }
  return blocked;
}

/** Returns true when the player landed on something. */
function resolveY(p: Point3, dir: number, h: number, r: number, cs: readonly AABB[]): boolean {
  let landed = false;
  setProbe(p, h, r);
  for (const c of cs) {
    if (!intersects(probe, c)) continue;
    if (dir > 0) {
      p.y = c.minY - h - SKIN;
    } else {
      p.y = c.maxY + SKIN;
      landed = true;
    }
    setProbe(p, h, r);
  }
  return landed;
}

/**
 * Moves the player by delta, sliding along anything in the way.
 * Splits the move into substeps so nothing tunnels through a thin wall, and
 * retries blocked horizontal moves from a step up so ledges and stairs work.
 */
export function moveAndCollide(
  p: Point3,
  delta: Point3,
  height: number,
  colliders: readonly AABB[],
  radius = PLAYER_RADIUS,
): MoveResult {
  const reach = Math.max(Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z));
  const steps = Math.max(1, Math.ceil(reach / MAX_SUBSTEP));
  const sx = delta.x / steps;
  const sy = delta.y / steps;
  const sz = delta.z / steps;

  let grounded = isGrounded(p, colliders, radius);
  let blockedX = false;
  let blockedZ = false;

  for (let i = 0; i < steps; i += 1) {
    const fromX = p.x;
    const fromZ = p.z;
    const fromY = p.y;

    p.x += sx;
    let bx = resolveX(p, sx, height, radius, colliders);
    p.z += sz;
    let bz = resolveZ(p, sz, height, radius, colliders);

    if ((bx || bz) && grounded) {
      const flatX = p.x;
      const flatZ = p.z;

      // Retry the same move from a step up.
      p.x = fromX;
      p.z = fromZ;
      p.y = fromY + STEP_HEIGHT;

      if (isClear(p, height, colliders, radius)) {
        p.x += sx;
        const bx2 = resolveX(p, sx, height, radius, colliders);
        p.z += sz;
        const bz2 = resolveZ(p, sz, height, radius, colliders);

        const gained =
          Math.abs(p.x - fromX) > Math.abs(flatX - fromX) + SKIN ||
          Math.abs(p.z - fromZ) > Math.abs(flatZ - fromZ) + SKIN;

        if (gained) {
          // Settle back onto the ledge.
          p.y -= STEP_HEIGHT;
          resolveY(p, -1, height, radius, colliders);
          bx = bx2;
          bz = bz2;
        } else {
          p.x = flatX;
          p.z = flatZ;
          p.y = fromY;
        }
      } else {
        p.x = flatX;
        p.z = flatZ;
        p.y = fromY;
      }
    }

    blockedX = blockedX || bx;
    blockedZ = blockedZ || bz;

    p.y += sy;
    if (resolveY(p, sy, height, radius, colliders)) grounded = true;
    else if (sy !== 0) grounded = isGrounded(p, colliders, radius);
  }

  return { grounded, blockedX, blockedZ };
}
