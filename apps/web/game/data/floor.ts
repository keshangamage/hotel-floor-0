import { room, slab, wallWithOpenings, type Opening } from "./builders";
import {
  CEILING_HEIGHT,
  CORRIDOR_HALF_WIDTH,
  DOOR_HEIGHT,
  DOOR_RECESS,
  DOOR_WIDTH,
  SLAB_THICKNESS,
  WALL_THICKNESS,
  WINDOW_ACROSS,
  WINDOW_SILL,
  WINDOW_TOP,
  WINDOW_WIDTH,
} from "./dimensions";
import { ELEVATOR, buildElevator } from "./elevator";
import { furnishHotelRoom, type RoomFrame } from "./furniture";
import { DEFAULT_SEED, generateFloor } from "../generation/generateFloor";
import type {
  BoxSpec, DoorSpec, FloorLayout, FloorSpec, LampSpec, PaintingSpec, PropSpec, RoomSpec, SwitchSpec, Vec3,
} from "../types";

const CORRIDOR_LAMP_INTENSITY = 17;
const ROOM_LAMP_INTENSITY = 11;

const OUTER_X = CORRIDOR_HALF_WIDTH + WALL_THICKNESS;

/** Corridor artwork, hung at eye level. */
const PAINTING_WIDTH = 0.62;
const PAINTING_HEIGHT = 0.78;
const PAINTING_CENTRE_Y = 1.6;

const doorway = (spec: RoomSpec): Opening => ({
  at: spec.doorZ,
  width: DOOR_WIDTH,
  height: DOOR_HEIGHT,
  recess: DOOR_RECESS,
  leaf: "open",
  casing: true,
});

const DOOR_THICKNESS = 0.045;

function doorFor(spec: RoomSpec): DoorSpec {
  return {
    id: `room-${spec.number}`,
    hinge: [spec.side * (CORRIDOR_HALF_WIDTH + DOOR_RECESS), 0, spec.doorZ - DOOR_WIDTH / 2],
    width: DOOR_WIDTH,
    height: DOOR_HEIGHT,
    thickness: DOOR_THICKNESS,
    closedYaw: 0,
    openYaw: (spec.side * Math.PI) / 2,
    locked: spec.door === "locked",
    label: String(spec.number),
  };
}

/** Centre of a room's interior. */
export function roomCentre(spec: RoomSpec): Vec3 {
  return [spec.side * (OUTER_X + spec.depth / 2), 0, spec.doorZ];
}

/** Paintings on the solid stretches between doorways. */
function corridorPaintings(spec: FloorSpec): PaintingSpec[] {
  const out: PaintingSpec[] = [];
  let art = 0;
  for (const side of [1, -1] as const) {
    const doors = spec.rooms.filter((r) => r.side === side).map((r) => r.doorZ);
    // Every other gap, so they punctuate the corridor instead of lining it.
    for (let i = 0; i < doors.length - 1; i += 2) {
      const z = (doors[i]! + doors[i + 1]!) / 2;
      out.push({
        id: `painting-${side > 0 ? "r" : "l"}-${i}`,
        position: [side * (CORRIDOR_HALF_WIDTH - 0.026), PAINTING_CENTRE_Y, z],
        side,
        width: PAINTING_WIDTH,
        height: PAINTING_HEIGHT,
        art: art++,
      });
    }
  }
  return out;
}

export function buildFloor(spec: FloorSpec): FloorLayout {
  const { corridorFrom: from, corridorTo: end } = spec;
  const length: [number, number] = [from, end];
  const full: [number, number] = [-OUTER_X, OUTER_X];

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
      openings: spec.rooms.filter((r) => r.side === 1).map(doorway),
      trim: true,
    }),
    ...wallWithOpenings({
      lengthAxis: "z",
      innerFace: -CORRIDOR_HALF_WIDTH,
      outerFace: -OUTER_X,
      span: length,
      height: CEILING_HEIGHT,
      openings: spec.rooms.filter((r) => r.side === -1).map(doorway),
      trim: true,
    }),

    // The +Z end is the elevator lobby. Its aperture is left open because the
    // sliding doors provide the collider that blocks it.
    ...wallWithOpenings({
      lengthAxis: "x",
      innerFace: end,
      outerFace: end + WALL_THICKNESS,
      span: full,
      height: CEILING_HEIGHT,
      openings: [
        { at: 0, width: ELEVATOR.doorWidth, height: ELEVATOR.doorHeight, recess: 0, leaf: "open" },
      ],
      trim: true,
    }),
    ...buildElevator(),
    ...wallWithOpenings({
      lengthAxis: "x",
      innerFace: from,
      outerFace: from - WALL_THICKNESS,
      span: full,
      height: CEILING_HEIGHT,
      trim: true,
    }),
  ];

  const extraLamps: LampSpec[] = [];
  const spawnPoints = new Map<number, Vec3>();
  const switches: SwitchSpec[] = [];
  const props: PropSpec[] = [];

  for (const spec_ of spec.rooms) {
    const frame: RoomFrame = { side: spec_.side, nearX: OUTER_X, doorZ: spec_.doorZ };
    const hasWindow = spec_.furnished === true;

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
        backOpenings: hasWindow
          ? [
              {
                at: spec_.doorZ + spec_.side * WINDOW_ACROSS,
                width: WINDOW_WIDTH,
                height: WINDOW_TOP,
                recess: 0,
                leaf: "open",
                sill: WINDOW_SILL,
                casing: true,
              },
            ]
          : undefined,
      }),
    );

    if (!spec_.furnished) continue;

    const furnishing = furnishHotelRoom(frame, spec_.depth, spec_.width, `room-${spec_.number}`);
    boxes.push(...furnishing.boxes);
    extraLamps.push(...furnishing.lamps);
    switches.push(...furnishing.switches);
    props.push(...furnishing.props);
    spawnPoints.set(spec_.number, furnishing.spawn);

    const paneX = spec_.side * (OUTER_X + spec_.depth + WALL_THICKNESS / 2);
    boxes.push({
      kind: "glass",
      position: [paneX, (WINDOW_SILL + WINDOW_TOP) / 2, spec_.doorZ + spec_.side * WINDOW_ACROSS],
      size: [0.03, WINDOW_TOP - WINDOW_SILL, WINDOW_WIDTH],
      collides: false,
    });
  }

  const lamps: LampSpec[] = spec.lamps.map((lamp) => ({
    position: [0, CEILING_HEIGHT, lamp.z],
    castShadow: lamp.castShadow && lamp.lit,
    intensity: CORRIDOR_LAMP_INTENSITY,
    lit: lamp.lit,
  }));

  lamps.push(...extraLamps);

  for (const r of spec.rooms) {
    if (!r.lit || r.furnished) continue;
    const [cx, , cz] = roomCentre(r);
    lamps.push({
      position: [cx, CEILING_HEIGHT, cz],
      castShadow: false,
      intensity: ROOM_LAMP_INTENSITY,
    });
  }

  // A furnished room decides its own standing spot; otherwise start in the
  // lobby, which is where the elevator puts you.
  const start = spec.spawnRoom === null ? undefined : spec.rooms.find((r) => r.number === spec.spawnRoom);
  const spawn: Vec3 = start
    ? (spawnPoints.get(start.number) ?? roomCentre(start))
    : [0, 0, end - 1.6];

  return {
    boxes,
    lamps,
    doors: spec.rooms.map(doorFor),
    switches,
    props,
    paintings: corridorPaintings(spec),
    spawn,
    spawnYaw: start ? (start.side === 1 ? Math.PI / 2 : -Math.PI / 2) : Math.PI,
  };
}

/** The hotel as it should be. Also the floor the player starts on. */
export const FLOOR_5 = generateFloor(5, DEFAULT_SEED);
export const FLOOR_5_LAYOUT: FloorLayout = buildFloor(FLOOR_5);
