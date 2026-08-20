import { slab, wallWithOpenings, type Opening } from "./builders";
import {
  CEILING_HEIGHT,
  CORRIDOR_HALF_WIDTH,
  DOOR_HEIGHT,
  DOOR_RECESS,
  DOOR_WIDTH,
  ROOM_PITCH,
  SLAB_THICKNESS,
  WALL_THICKNESS,
} from "./dimensions";
import type { BoxSpec } from "../types";

/** Corridors run along Z, so X is the short axis and the walls sit at ±X. */
export interface CorridorSpec {
  /** Runs from -halfLength to +halfLength along Z. */
  readonly halfLength: number;
  /** Door centres (Z) on the +X wall. */
  readonly rightDoorsAt: readonly number[];
  /** Door centres (Z) on the -X wall. */
  readonly leftDoorsAt: readonly number[];
}

/**
 * Doors are staggered by half a room pitch rather than facing each other. Real
 * hotels do this, and it stops the corridor reading as a symmetric tunnel.
 */
export const GREYBOX_CORRIDOR: CorridorSpec = {
  halfLength: 10,
  leftDoorsAt: [-6, -2, 2, 6],
  rightDoorsAt: [-6, -2, 2, 6].map((z) => z + ROOM_PITCH / 2),
};

const doorway = (at: number): Opening => ({
  at,
  width: DOOR_WIDTH,
  height: DOOR_HEIGHT,
  recess: DOOR_RECESS,
});

export function buildCorridor(spec: CorridorSpec): BoxSpec[] {
  const { halfLength } = spec;
  const outerX = CORRIDOR_HALF_WIDTH + WALL_THICKNESS;
  const length: [number, number] = [-halfLength, halfLength];
  const full: [number, number] = [-outerX, outerX];

  return [
    // Floor top sits at y = 0; the ceiling slab starts at CEILING_HEIGHT.
    slab("floor", { x: full, y: [-SLAB_THICKNESS, 0], z: length }),
    slab("ceiling", {
      x: full,
      y: [CEILING_HEIGHT, CEILING_HEIGHT + SLAB_THICKNESS],
      z: length,
    }),

    ...wallWithOpenings({
      lengthAxis: "z",
      innerFace: CORRIDOR_HALF_WIDTH,
      outerFace: outerX,
      span: length,
      height: CEILING_HEIGHT,
      openings: spec.rightDoorsAt.map(doorway),
      trim: true,
    }),
    ...wallWithOpenings({
      lengthAxis: "z",
      innerFace: -CORRIDOR_HALF_WIDTH,
      outerFace: -outerX,
      span: length,
      height: CEILING_HEIGHT,
      openings: spec.leftDoorsAt.map(doorway),
      trim: true,
    }),

    // Dead ends, so the greybox is a closed volume to test collision against.
    ...wallWithOpenings({
      lengthAxis: "x",
      innerFace: halfLength,
      outerFace: halfLength + WALL_THICKNESS,
      span: full,
      height: CEILING_HEIGHT,
      trim: true,
    }),
    ...wallWithOpenings({
      lengthAxis: "x",
      innerFace: -halfLength,
      outerFace: -halfLength - WALL_THICKNESS,
      span: full,
      height: CEILING_HEIGHT,
      trim: true,
    }),
  ];
}

/** Built once at module load — the layout is deterministic and takes no input. */
export const CORRIDOR_LAYOUT: readonly BoxSpec[] = buildCorridor(GREYBOX_CORRIDOR);
