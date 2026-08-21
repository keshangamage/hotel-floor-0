import { TRIM_DEPTH, TRIM_HEIGHT } from "./dimensions";
import type { BoxSpec, SurfaceKind, Vec3 } from "../types";

/**
 * Reusable hotel building blocks.
 *
 * These are *builders*, not React components: they emit `BoxSpec[]`, which the
 * renderer draws and the collision pass consumes. Keeping them as data means
 * Milestone 4's `generateFloor(floorNumber, seed)` can compose the exact same
 * walls and slabs procedurally - something a tree of JSX components could not
 * do without a second, parallel code path.
 */

/** Inclusive min/max on each axis. */
export interface Bounds {
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly z: readonly [number, number];
}

const span = (range: readonly [number, number]) => range[1] - range[0];
const midpoint = (range: readonly [number, number]) => (range[0] + range[1]) / 2;

export function boxFromBounds(
  kind: SurfaceKind,
  bounds: Bounds,
  collides = true,
  visible = true,
): BoxSpec {
  const position: Vec3 = [midpoint(bounds.x), midpoint(bounds.y), midpoint(bounds.z)];
  const size: Vec3 = [span(bounds.x), span(bounds.y), span(bounds.z)];
  return { kind, position, size, collides, visible };
}

/** A horizontal slab: floor or ceiling. */
export function slab(kind: "floor" | "ceiling", bounds: Bounds): BoxSpec {
  return boxFromBounds(kind, bounds);
}

export interface Opening {
  /** Centre along the wall's length axis. */
  readonly at: number;
  readonly width: number;
  readonly height: number;
  /** How far the door sits back from the inner face. */
  readonly recess: number;
  /** "open" leaves the aperture clear so the player can walk through. */
  readonly leaf?: "closed" | "open";
  /** Height of the wall below the aperture. Above 0 makes it a window. */
  readonly sill?: number;
  /** Raised surround. Without it an opening reads as a hole in the wall. */
  readonly casing?: boolean;
}

export interface WallOptions {
  /** Axis the wall runs along. Thickness is on the other horizontal axis. */
  readonly lengthAxis: "x" | "z";
  /** Face the room or corridor sees. */
  readonly innerFace: number;
  /** Back face. */
  readonly outerFace: number;
  readonly span: readonly [number, number];
  readonly height: number;
  readonly openings?: readonly Opening[];
  /** Skirting along the inner face. Never collides. */
  readonly trim?: boolean;
}

/**
 * A straight wall run, optionally interrupted by recessed doorways.
 * Alcoves need no geometry: a segment ends flush with the opening, so its end
 * face is the jamb. Only the lintel and the recessed door panel are added.
 */
export function wallWithOpenings(options: WallOptions): BoxSpec[] {
  const { lengthAxis, innerFace, outerFace, height, openings = [], trim = false } = options;

  // Which way "into the wall" points, so all four orientations work.
  const inward = Math.sign(outerFace - innerFace) || 1;
  const thickness: readonly [number, number] =
    inward > 0 ? [innerFace, outerFace] : [outerFace, innerFace];

  const out: BoxSpec[] = [];
  const at = (
    kind: SurfaceKind,
    length: readonly [number, number],
    depth: readonly [number, number],
    y: readonly [number, number],
    collides: boolean,
  ) => {
    const bounds: Bounds =
      lengthAxis === "z"
        ? { x: depth, y, z: length }
        : { x: length, y, z: depth };
    out.push(boxFromBounds(kind, bounds, collides));
  };

  const sorted = [...openings].sort((a, b) => a.at - b.at);

  let cursor = options.span[0];
  const segment = (from: number, to: number) => {
    if (to - from <= 1e-6) return;
    at("wall", [from, to], thickness, [0, height], true);
    if (trim) {
      const face: readonly [number, number] =
        inward > 0
          ? [innerFace - TRIM_DEPTH, innerFace]
          : [innerFace, innerFace + TRIM_DEPTH];
      at("trim", [from, to], face, [0, TRIM_HEIGHT], false);
    }
  };

  for (const opening of sorted) {
    const half = opening.width / 2;
    segment(cursor, opening.at - half);
    cursor = opening.at + half;
  }
  segment(cursor, options.span[1]);

  for (const opening of sorted) {
    const half = opening.width / 2;
    const length: readonly [number, number] = [opening.at - half, opening.at + half];
    // Lintel above the opening.
    at("wall", length, thickness, [opening.height, height], true);
    const sill = opening.sill ?? 0;
    if (sill > 0) at("wall", length, thickness, [0, sill], true);

    if (opening.casing) {
      const face: readonly [number, number] =
        inward > 0
          ? [innerFace - CASING_DEPTH, innerFace]
          : [innerFace, innerFace + CASING_DEPTH];
      const outerA = opening.at - half - CASING_WIDTH;
      const outerB = opening.at + half + CASING_WIDTH;
      // Two jambs and a head, standing proud of the wall.
      at("trim", [outerA, opening.at - half], face, [sill, opening.height + CASING_WIDTH], false);
      at("trim", [opening.at + half, outerB], face, [sill, opening.height + CASING_WIDTH], false);
      at("trim", [outerA, outerB], face, [opening.height, opening.height + CASING_WIDTH], false);
    }
    if (opening.leaf === "open") continue;
    // Door at the back of the alcove.
    const back = innerFace + inward * opening.recess;
    const doorDepth: readonly [number, number] =
      inward > 0 ? [back, outerFace] : [outerFace, back];
    at("door", length, doorDepth, [sill, opening.height], true);
  }

  return out;
}

/** Door and window surrounds. */
const CASING_WIDTH = 0.085;
const CASING_DEPTH = 0.035;

/** Orders a pair so callers can describe walls in either direction. */
const ordered = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);

export interface RoomOptions {
  /** +1 for a room off the +X wall, -1 for the -X wall. */
  readonly side: 1 | -1;
  /** Outer face of the corridor wall the room opens off. */
  readonly corridorOuterX: number;
  /** Centre of the room's doorway, along Z. */
  readonly doorZ: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly wallThickness: number;
  readonly slabThickness: number;
  /** Openings in the exterior wall, e.g. windows. */
  readonly backOpenings?: readonly Opening[];
}

/**
 * A sealed box room opening off a corridor. The corridor wall is not emitted
 * here: the floor builder punches that opening so the two cannot disagree.
 */
export function room(options: RoomOptions): BoxSpec[] {
  const { side, corridorOuterX, doorZ, width, depth, height, wallThickness: t } = options;

  const nearX = side * corridorOuterX;
  const farX = side * (corridorOuterX + depth);
  const backX = side * (corridorOuterX + depth + t);
  const zNear = doorZ - width / 2;
  const zFar = doorZ + width / 2;

  const shellX = ordered(nearX, backX);
  const shellZ: [number, number] = [zNear - t, zFar + t];

  return [
    slab("floor", { x: shellX, y: [-options.slabThickness, 0], z: shellZ }),
    slab("ceiling", {
      x: shellX,
      y: [height, height + options.slabThickness],
      z: shellZ,
    }),
    // Back wall, parallel to the corridor. This is the building exterior.
    ...wallWithOpenings({
      lengthAxis: "z",
      innerFace: farX,
      outerFace: backX,
      span: shellZ,
      height,
      openings: options.backOpenings,
      trim: true,
    }),
    // The two dividing walls between neighbouring rooms.
    ...wallWithOpenings({
      lengthAxis: "x",
      innerFace: zFar,
      outerFace: zFar + t,
      span: shellX,
      height,
      trim: true,
    }),
    ...wallWithOpenings({
      lengthAxis: "x",
      innerFace: zNear,
      outerFace: zNear - t,
      span: shellX,
      height,
      trim: true,
    }),
  ];
}
