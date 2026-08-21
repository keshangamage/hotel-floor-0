import { boxFromBounds, slab } from "./builders";
import { CEILING_HEIGHT, SLAB_THICKNESS, WALL_THICKNESS } from "./dimensions";
import type { BoxSpec, Vec3 } from "../types";

/** The elevator sits behind the +Z end of the corridor. */
export const ELEVATOR = {
  /** Corridor-side face of the shaft wall. */
  frontZ: 10,
  carDepth: 2.2,
  carHalfWidth: 1.0,
  carHeight: 2.4,
  /** Clear width of the opening, split between two panels. */
  doorWidth: 1.1,
  doorHeight: 2.1,
  doorThickness: 0.08,
  /** How close the player must be for the doors to open. */
  callRadius: 3.2,
} as const;

export const PANEL_WIDTH = ELEVATOR.doorWidth / 2;

/** Doors sit just in front of the shaft wall and slide sideways into it. */
export const DOOR_Z = ELEVATOR.frontZ - ELEVATOR.doorThickness / 2 - 0.01;

const shaftInnerZ = ELEVATOR.frontZ + WALL_THICKNESS;
const backZ = shaftInnerZ + ELEVATOR.carDepth;

export const CAR_CENTRE: Vec3 = [0, 0, shaftInnerZ + ELEVATOR.carDepth / 2];

/** Interior shell of the car. The shaft wall itself belongs to the corridor. */
export function buildElevator(): BoxSpec[] {
  const halfW = ELEVATOR.carHalfWidth;
  const outer = halfW + WALL_THICKNESS;
  // Slabs start at the shaft wall's corridor face, not behind it. Starting at
  // shaftInnerZ left a wall-thickness slot with no floor across the threshold.
  const z: [number, number] = [ELEVATOR.frontZ, backZ + WALL_THICKNESS];

  return [
    slab("floor", { x: [-outer, outer], y: [-SLAB_THICKNESS, 0], z }),
    slab("ceiling", {
      x: [-outer, outer],
      y: [ELEVATOR.carHeight, ELEVATOR.carHeight + SLAB_THICKNESS],
      z,
    }),
    // Back and side walls, in brushed steel rather than wallpaper.
    boxFromBounds("metal", {
      x: [-outer, outer],
      y: [0, ELEVATOR.carHeight],
      z: [backZ, backZ + WALL_THICKNESS],
    }),
    boxFromBounds("metal", {
      x: [halfW, outer],
      y: [0, ELEVATOR.carHeight],
      z: [shaftInnerZ, backZ],
    }),
    boxFromBounds("metal", {
      x: [-outer, -halfW],
      y: [0, ELEVATOR.carHeight],
      z: [shaftInnerZ, backZ],
    }),
    // Fills the gap between the car's lower ceiling and the corridor's.
    boxFromBounds("wall", {
      x: [-outer, outer],
      y: [ELEVATOR.carHeight + SLAB_THICKNESS, CEILING_HEIGHT + SLAB_THICKNESS],
      z,
    }),
  ];
}

/** Button panel, on the right-hand wall as you enter. */
export const PANEL_POSITION: Vec3 = [
  ELEVATOR.carHalfWidth - 0.02,
  1.15,
  shaftInnerZ + 0.55,
];

/** Floor indicator, above the doors on the corridor side. */
export const DISPLAY_POSITION: Vec3 = [0, ELEVATOR.doorHeight + 0.26, ELEVATOR.frontZ - 0.04];
