import type { AABB, DoorSpec } from "../types";

/** Smoothstep, so a door does not start and stop abruptly. */
export function doorYaw(spec: DoorSpec, progress: number): number {
  const eased = progress * progress * (3 - 2 * progress);
  return spec.closedYaw + (spec.openYaw - spec.closedYaw) * eased;
}

/**
 * Exact world bounds of a door panel swung to `yaw`.
 *
 * A swinging panel is not axis aligned, so its collider is the bounding box of
 * the rotated footprint. Written in place: this runs for every door, every frame.
 */
export function doorFootprint(spec: DoorSpec, yaw: number, out: AABB): AABB {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const [hx, hy, hz] = spec.hinge;
  const halfT = spec.thickness / 2;

  // Offsets contributed by the panel's thickness and its length.
  const tx = halfT * cos;
  const tz = -halfT * sin;
  const wx = spec.width * sin;
  const wz = spec.width * cos;

  const x0 = hx - tx;
  const x1 = hx + tx;
  const z0 = hz - tz;
  const z1 = hz + tz;

  out.minX = Math.min(x0, x1, x0 + wx, x1 + wx);
  out.maxX = Math.max(x0, x1, x0 + wx, x1 + wx);
  out.minZ = Math.min(z0, z1, z0 + wz, z1 + wz);
  out.maxZ = Math.max(z0, z1, z0 + wz, z1 + wz);
  out.minY = hy;
  out.maxY = hy + spec.height;
  return out;
}
