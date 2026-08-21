import type { Point3 } from "../types";

export const WALK_SPEED = 1.9;
export const SPRINT_SPEED = 3.4;
export const CROUCH_SPEED = 1.0;

/** How hard the player accelerates toward the target velocity. */
const ACCELERATION = 30;
/** Exponential damping, applied when there is no input. */
const DAMPING = 12;
export const GRAVITY = -18;

export interface MoveIntent {
  /** -1 back, +1 forward. */
  readonly forward: number;
  /** -1 left, +1 right. */
  readonly strafe: number;
  readonly sprint: boolean;
  readonly crouch: boolean;
}

export function targetSpeed(intent: MoveIntent): number {
  if (intent.crouch) return CROUCH_SPEED;
  return intent.sprint ? SPRINT_SPEED : WALK_SPEED;
}

/**
 * Accelerates horizontal velocity toward the intended direction, in world space.
 * Yaw comes in as a number so this module never touches Three.js.
 */
export function integrateHorizontal(
  velocity: Point3,
  intent: MoveIntent,
  yaw: number,
  dt: number,
): void {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);

  // Camera forward is -Z, so forward is (-sin, -cos) and right is (cos, -sin).
  let dirX = intent.forward * -sin + intent.strafe * cos;
  let dirZ = intent.forward * -cos + intent.strafe * -sin;

  const length = Math.hypot(dirX, dirZ);
  if (length > 0) {
    // Normalise so diagonals are not faster than the cardinals.
    dirX /= length;
    dirZ /= length;

    const speed = targetSpeed(intent);
    const blend = Math.min(1, ACCELERATION * dt);
    velocity.x += (dirX * speed - velocity.x) * blend;
    velocity.z += (dirZ * speed - velocity.z) * blend;
  } else {
    const decay = Math.exp(-DAMPING * dt);
    velocity.x *= decay;
    velocity.z *= decay;
  }
}

export function applyGravity(velocity: Point3, grounded: boolean, dt: number): void {
  if (grounded && velocity.y <= 0) {
    // A small downward bias keeps the ground probe in contact on slopes.
    velocity.y = -1;
    return;
  }
  velocity.y += GRAVITY * dt;
}

export function horizontalSpeed(velocity: Point3): number {
  return Math.hypot(velocity.x, velocity.z);
}
