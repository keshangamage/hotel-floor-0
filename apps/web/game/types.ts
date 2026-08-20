/** Mutable tuple so these drop straight into R3F's `position` / `scale` props. */
export type Vec3 = [number, number, number];

export type SurfaceKind = "wall" | "floor" | "ceiling" | "door" | "trim";

/**
 * An axis-aligned box of hotel.
 *
 * This is the single source of truth for the environment: `<Corridor>` renders
 * these as meshes, and the player's collision pass derives its colliders from
 * the exact same array. Because both consumers read one list, the geometry you
 * see and the geometry you bump into cannot drift apart.
 *
 * `generateFloor(floorNumber, seed)` will emit this same shape in Milestone 4.
 */
export interface BoxSpec {
  readonly kind: SurfaceKind;
  /** Centre of the box, in world units. */
  readonly position: Vec3;
  /** Full extents (not half-extents). */
  readonly size: Vec3;
  /** Whether the player collides with it. Decorative trim does not. */
  readonly collides: boolean;
}
