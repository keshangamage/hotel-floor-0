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
import type { FloorLayout, LampSpec, Vec3 } from "../types";

/** Corridors run along Z, so X is the short axis and the walls sit at +/-X. */
export interface CorridorSpec {
  readonly halfLength: number;
  /** Door centres (Z) on the +X wall. */
  readonly rightDoorsAt: readonly number[];
  /** Door centres (Z) on the -X wall. */
  readonly leftDoorsAt: readonly number[];
  /** Ceiling fixture centres (Z). */
  readonly lampsAt: readonly number[];
  /** Which lamps cast shadows, by index into lampsAt. */
  readonly shadowCasters: readonly number[];
}

/** Doors are staggered by half a pitch so the corridor is not a symmetric tunnel. */
export const GREYBOX_CORRIDOR: CorridorSpec = {
  halfLength: 10,
  leftDoorsAt: [-6, -2, 2, 6],
  rightDoorsAt: [-6, -2, 2, 6].map((z) => z + ROOM_PITCH / 2),
  lampsAt: [-8, -4, 0, 4, 8],
  shadowCasters: [1, 3],
};

const doorway = (at: number): Opening => ({
  at,
  width: DOOR_WIDTH,
  height: DOOR_HEIGHT,
  recess: DOOR_RECESS,
});

/** Candela. Falls off as 1/d^2, so this is roughly 1 lux at floor level. */
const LAMP_INTENSITY = 9;

export function buildCorridor(spec: CorridorSpec): FloorLayout {
  const { halfLength } = spec;
  const outerX = CORRIDOR_HALF_WIDTH + WALL_THICKNESS;
  const length: [number, number] = [-halfLength, halfLength];
  const full: [number, number] = [-outerX, outerX];

  const boxes = [
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

  const lamps: LampSpec[] = spec.lampsAt.map((z, index) => ({
    position: [0, CEILING_HEIGHT, z],
    castShadow: spec.shadowCasters.includes(index),
    intensity: LAMP_INTENSITY,
  }));

  // Standing at one end, facing down the corridor.
  const spawn: Vec3 = [0, 0, halfLength - 1.5];

  return { boxes, lamps, spawn };
}

/** Built once at module load. The layout is deterministic and takes no input. */
export const CORRIDOR_LAYOUT: FloorLayout = buildCorridor(GREYBOX_CORRIDOR);
