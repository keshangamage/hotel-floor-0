import { room, slab, wallWithOpenings, type Opening } from "./builders";
import { ELEVATOR, buildElevator } from "./elevator";
import {
  CEILING_HEIGHT,
  CORRIDOR_HALF_WIDTH,
  DOOR_HEIGHT,
  DOOR_RECESS,
  DOOR_WIDTH,
  SLAB_THICKNESS,
  WALL_THICKNESS,
} from "./dimensions";
import type { BoxSpec, FloorLayout, LampSpec, Vec3 } from "../types";

export interface RoomSpec {
  /** Displayed room number, e.g. 507. */
  readonly number: number;
  /** +1 for the +X wall, -1 for the -X wall. */
  readonly side: 1 | -1;
  /** Doorway centre along the corridor. */
  readonly doorZ: number;
  readonly width: number;
  readonly depth: number;
  /** Open doorways are walkable. Closed ones get a door panel. */
  readonly door: "closed" | "open";
  /** Unlit rooms stay dark until the player brings a light. */
  readonly lit: boolean;
}

export interface FloorSpec {
  readonly halfLength: number;
  readonly rooms: readonly RoomSpec[];
  /** Corridor ceiling fixture centres, along Z. */
  readonly lampsAt: readonly number[];
  /** Indices into lampsAt that cast shadows. */
  readonly shadowCasters: readonly number[];
  /** Room number the player starts inside. */
  readonly spawnRoom: number;
}

const CORRIDOR_LAMP_INTENSITY = 9;
const ROOM_LAMP_INTENSITY = 7;

const ROOM_WIDTH = 3.4;
const ROOM_DEPTH = 4.5;

/**
 * Floor 5. Odd rooms on the -X wall, even on +X, as a real hotel numbers them.
 * The elevator will sit at the +Z end, so 507 is at the far end and the player
 * walks the length of the corridor to reach it.
 */
export const FLOOR_5: FloorSpec = {
  halfLength: 10,
  spawnRoom: 507,
  lampsAt: [-8, -4, 0, 4, 8],
  shadowCasters: [1, 3],
  rooms: [
    { number: 501, side: -1, doorZ: 6, width: ROOM_WIDTH, depth: ROOM_DEPTH, door: "closed", lit: false },
    { number: 503, side: -1, doorZ: 2, width: ROOM_WIDTH, depth: ROOM_DEPTH, door: "closed", lit: false },
    { number: 505, side: -1, doorZ: -2, width: ROOM_WIDTH, depth: ROOM_DEPTH, door: "closed", lit: false },
    { number: 507, side: -1, doorZ: -6, width: ROOM_WIDTH, depth: ROOM_DEPTH, door: "open", lit: true },
    { number: 502, side: 1, doorZ: 8, width: ROOM_WIDTH, depth: ROOM_DEPTH, door: "closed", lit: false },
    { number: 504, side: 1, doorZ: 4, width: ROOM_WIDTH, depth: ROOM_DEPTH, door: "closed", lit: false },
    { number: 506, side: 1, doorZ: 0, width: ROOM_WIDTH, depth: ROOM_DEPTH, door: "closed", lit: false },
    { number: 508, side: 1, doorZ: -4, width: ROOM_WIDTH, depth: ROOM_DEPTH, door: "closed", lit: false },
  ],
};

const OUTER_X = CORRIDOR_HALF_WIDTH + WALL_THICKNESS;

const doorway = (spec: RoomSpec): Opening => ({
  at: spec.doorZ,
  width: DOOR_WIDTH,
  height: DOOR_HEIGHT,
  recess: DOOR_RECESS,
  leaf: spec.door,
});

/** Centre of a room's interior. */
export function roomCentre(spec: RoomSpec): Vec3 {
  return [spec.side * (OUTER_X + spec.depth / 2), 0, spec.doorZ];
}

export function buildFloor(spec: FloorSpec): FloorLayout {
  const { halfLength } = spec;
  const length: [number, number] = [-halfLength, halfLength];
  const full: [number, number] = [-OUTER_X, OUTER_X];

  const rightRooms = spec.rooms.filter((r) => r.side === 1);
  const leftRooms = spec.rooms.filter((r) => r.side === -1);

  const boxes: BoxSpec[] = [
    slab("floor", { x: full, y: [-SLAB_THICKNESS, 0], z: length }),
    slab("ceiling", {
      x: full,
      y: [CEILING_HEIGHT, CEILING_HEIGHT + SLAB_THICKNESS],
      z: length,
    }),

    // Corridor walls. Their openings come from the room list, so a room and its
    // doorway can never disagree.
    ...wallWithOpenings({
      lengthAxis: "z",
      innerFace: CORRIDOR_HALF_WIDTH,
      outerFace: OUTER_X,
      span: length,
      height: CEILING_HEIGHT,
      openings: rightRooms.map(doorway),
      trim: true,
    }),
    ...wallWithOpenings({
      lengthAxis: "z",
      innerFace: -CORRIDOR_HALF_WIDTH,
      outerFace: -OUTER_X,
      span: length,
      height: CEILING_HEIGHT,
      openings: leftRooms.map(doorway),
      trim: true,
    }),

    // The +Z end is the elevator lobby. Its aperture is left open because the
    // sliding doors provide the collider that blocks it.
    ...wallWithOpenings({
      lengthAxis: "x",
      innerFace: halfLength,
      outerFace: halfLength + WALL_THICKNESS,
      span: full,
      height: CEILING_HEIGHT,
      openings: [
        {
          at: 0,
          width: ELEVATOR.doorWidth,
          height: ELEVATOR.doorHeight,
          recess: 0,
          leaf: "open",
        },
      ],
      trim: true,
    }),
    ...buildElevator(),
    ...wallWithOpenings({
      lengthAxis: "x",
      innerFace: -halfLength,
      outerFace: -halfLength - WALL_THICKNESS,
      span: full,
      height: CEILING_HEIGHT,
      trim: true,
    }),
  ];

  for (const spec_ of spec.rooms) {
    boxes.push(
      ...room({
        side: spec_.side,
        corridorOuterX: OUTER_X,
        doorZ: spec_.doorZ,
        width: spec_.width,
        depth: spec_.depth,
        height: CEILING_HEIGHT,
        wallThickness: WALL_THICKNESS,
        slabThickness: SLAB_THICKNESS,
      }),
    );
  }

  const lamps: LampSpec[] = spec.lampsAt.map((z, index) => ({
    position: [0, CEILING_HEIGHT, z],
    castShadow: spec.shadowCasters.includes(index),
    intensity: CORRIDOR_LAMP_INTENSITY,
  }));

  for (const r of spec.rooms) {
    if (!r.lit) continue;
    const [cx, , cz] = roomCentre(r);
    lamps.push({
      position: [cx, CEILING_HEIGHT, cz],
      castShadow: false,
      intensity: ROOM_LAMP_INTENSITY,
    });
  }

  const start = spec.rooms.find((r) => r.number === spec.spawnRoom);
  if (!start) throw new Error(`spawnRoom ${spec.spawnRoom} is not on this floor`);
  const [sx, , sz] = roomCentre(start);

  return {
    boxes,
    lamps,
    spawn: [sx, 0, sz],
    // Face the doorway, out toward the corridor.
    spawnYaw: start.side === 1 ? Math.PI / 2 : -Math.PI / 2,
  };
}

export const FLOOR_5_LAYOUT: FloorLayout = buildFloor(FLOOR_5);
