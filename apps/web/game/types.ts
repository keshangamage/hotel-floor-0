/** Mutable tuple so these drop into R3F position/scale props. */
export type Vec3 = [number, number, number];

export type SurfaceKind = "wall" | "floor" | "ceiling" | "door" | "trim";

/** One axis-aligned box. The renderer draws these and collision reads the same array. */
export interface BoxSpec {
  readonly kind: SurfaceKind;
  readonly position: Vec3;
  /** Full extents, not half-extents. */
  readonly size: Vec3;
  readonly collides: boolean;
}

/** A ceiling fixture. Shadow casters are opt-in because they are the main cost. */
export interface LampSpec {
  readonly position: Vec3;
  readonly castShadow: boolean;
  readonly intensity: number;
}

/** Everything needed to build one floor. Milestone 4 generates this shape. */
export interface FloorLayout {
  readonly boxes: readonly BoxSpec[];
  readonly lamps: readonly LampSpec[];
}
