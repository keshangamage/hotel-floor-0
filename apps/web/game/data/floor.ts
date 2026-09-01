import { G_FLOOR } from "../systems/elevator";
import { boxFromBounds, room, slab, wallWithOpenings, type Opening } from "./builders";
import {
  CEILING_HEIGHT,
  CORRIDOR_HALF_WIDTH,
  DOOR_HEIGHT,
  DOOR_RECESS,
  DOOR_WIDTH,
  SLAB_THICKNESS,
  WALL_THICKNESS,
  WINDOW_ACROSS,
  WINDOW_FRAME_BASE,
  WINDOW_SCALE,
  WINDOW_SILL,
  WINDOW_TOP,
  WINDOW_WIDTH,
} from "./dimensions";
import { PROP_SIZES } from "./propSizes.generated";
import { ELEVATOR, buildElevator } from "./elevator";
import { furnishHotelRoom, type RoomFrame } from "./furniture";
import { DEFAULT_SEED, generateFloor } from "../generation/generateFloor";
import type {
  BoxSpec, DoorSpec, FloorLayout, FloorSpec, LampSpec, PaintingSpec, NoteSpec,
  PropSpec, RoomSpec, SwitchSpec, Vec3,
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
    // The room that is open stands open, so the corridor shows at a glance
    // which one it is, and shows when that has changed.
    startsOpen: spec.door === "unlocked",
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

  // Pictures are dressing rather than plan, so a floor that has lost one or
  // swapped one measures identical to the floor above it.
  const anomaly = spec.anomaly;
  if (!anomaly || out.length === 0) return out;
  const at = anomaly.target % out.length;

  if (anomaly.kind === "painting-gone") return out.filter((_, i) => i !== at);
  if (anomaly.kind === "painting-changed") {
    // Next one along, so it is a picture that belongs in this hotel rather
    // than something obviously imported.
    const hung = out[at]!;
    return out.map((p, i) => (i === at ? { ...p, art: hung.art + 1 } : p));
  }
  return out;
}

/**
 * What is waiting at the end of each corridor below the hotel.
 *
 * One page per floor, lying on the floor at the far end, and each one both
 * tells the player something and lets them leave. The way on is never solved,
 * only found, and never upward.
 *
 * They are the hotel becoming a memory: the counting the guest notice thanked
 * the player for turns out to be someone else's, from a long time ago.
 */
const BELOW = new Map<number, { title: string; lines: string[]; opens?: number }>([
  [0, {
    title: "Notice to guests",
    lines: [
      "You have reached the ground floor.",
      "",
      "There is nothing beneath a hotel.",
      "",
      "Thank you for counting.",
      "",
      "Please return to your room.",
    ],
    opens: -1,
  }],
  [-1, {
    title: "On the back of a receipt",
    lines: [
      "The carpet on this floor is the carpet",
      "from the landing at home.",
      "",
      "I did not see it until tonight,",
      "and I have walked over it a thousand times.",
    ],
    opens: -2,
  }],
  [-2, {
    title: "In the margin of a newspaper",
    lines: [
      "There was a hotel like this one.",
      "We stayed a week. I was nine.",
      "",
      "The lift took a long time, and my father",
      "counted the floors aloud on the way down",
      "so that I would not be frightened.",
    ],
    opens: -3,
  }],
  [-3, {
    title: "In my own hand",
    lines: [
      "He counted down.",
      "",
      "Five. Four. Three. Two. One.",
      "",
      "And then he said the word that is not a number,",
      "and I have been listening for it ever since.",
    ],
    opens: G_FLOOR,
  }],
]);


function endingNote(spec: FloorSpec): NoteSpec[] {
  const page = BELOW.get(spec.floorNumber);
  if (!page) return [];
  return [
    {
      id: `floor-${spec.floorNumber}-notice`,
      // At the far end, so the walk through the dark is the price of it.
      position: [0, 0.01, spec.corridorFrom + 0.9],
      yaw: 0,
      title: page.title,
      lines: page.lines,
      opens: page.opens,
    },
  ];
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
      // A window at the dead end. The tail was blank wall the player walked
      // toward and turned away from, and it is the stretch the corridor
      // anomalies lengthen and shorten, so it needed something to measure
      // against: a landmark that moves is far easier to read than a wall that
      // is simply further off.
      openings: [
        { at: 0, width: WINDOW_WIDTH, height: WINDOW_TOP, recess: 0, leaf: "open", sill: WINDOW_SILL },
      ],
      trim: true,
    }),
    // Glazing, so the hole is a window rather than a way out.
    boxFromBounds("glass", {
      x: [-WINDOW_WIDTH / 2, WINDOW_WIDTH / 2],
      y: [WINDOW_SILL, WINDOW_TOP],
      z: [from - WALL_THICKNESS / 2 - 0.015, from - WALL_THICKNESS / 2 + 0.015],
    }, false),
  ];

  const extraLamps: LampSpec[] = [];
  const spawnPoints = new Map<number, Vec3>();
  const switches: SwitchSpec[] = [];
  const props: PropSpec[] = [];
  const notes: NoteSpec[] = [];

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

    const furnishing = furnishHotelRoom(
      frame, spec_.depth, spec_.width, `room-${spec_.number}`,
      spec.anomaly?.kind,
    );
    boxes.push(...furnishing.boxes);
    extraLamps.push(...furnishing.lamps);
    switches.push(...furnishing.switches);
    props.push(...furnishing.props);
    notes.push(...furnishing.notes);
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
    // A flickering fixture never casts: rebuilding a shadow map every frame
    // costs more than the whole rest of the corridor's lighting.
    castShadow: lamp.castShadow && lamp.lit && !lamp.flicker,
    intensity: CORRIDOR_LAMP_INTENSITY,
    lit: lamp.lit,
    flicker: lamp.flicker,
  }));

  lamps.push(...extraLamps);

  for (const r of spec.rooms) {
    if (!r.lit || r.furnished) continue;
    const [cx, , cz] = roomCentre(r);
    lamps.push({
      position: [cx, CEILING_HEIGHT, cz],
      castShadow: false,
      intensity: ROOM_LAMP_INTENSITY,
      // Kept inside the room. A light with no shadow does not stop at a wall,
      // so an unbounded one washed the corridor with a glow that came through
      // solid plaster rather than from the doorway.
      distance: 2.2,
    });

    // What the player actually sees: a pool at the foot of that one door, as
    // if the light were escaping underneath it. The room itself is locked and
    // never entered, so this is the whole of the anomaly.
    lamps.push({
      position: [r.side * (CORRIDOR_HALF_WIDTH - 0.06), 0.16, r.doorZ],
      castShadow: false,
      kind: "bare",
      intensity: 1.6,
      distance: 2.4,
      color: "#ffca8a",
    });
  }

  // A furnished room decides its own standing spot; otherwise start in the
  // lobby, which is where the elevator puts you.
  const start = spec.spawnRoom === null ? undefined : spec.rooms.find((r) => r.number === spec.spawnRoom);
  const spawn: Vec3 = start
    ? (spawnPoints.get(start.number) ?? roomCentre(start))
    : [0, 0, end - 1.6];

  // The same frame the rooms use, turned to face back down the corridor.
  props.push({
    instanceId: "corridor-window",
    id: "window",
    position: [0, WINDOW_FRAME_BASE, from - (PROP_SIZES.window[2] * WINDOW_SCALE) / 2],
    yaw: 0,
    scale: WINDOW_SCALE,
  });

  return {
    boxes,
    lamps,
    // A door plate is dressing rather than plan: the room still has its
    // number, and only the thing screwed to the wall is missing. A door that
    // opens itself is dressing too, and picks a locked one so it is a door
    // that could not have been opened rather than one left ajar.
    doors: spec.rooms.map(doorFor).map((door, i) => {
      const chosen = spec.anomaly ? i === spec.anomaly.target % spec.rooms.length : false;
      if (spec.anomaly?.kind === "sign-gone" && chosen) return { ...door, label: undefined };
      if (spec.anomaly?.kind === "door-opens") {
        const shut = spec.rooms.map((r, j) => (r.door === "locked" ? j : -1)).filter((j) => j >= 0);
        const at = shut[spec.anomaly.target % Math.max(1, shut.length)];
        if (i === at) return { ...door, opensUnwatched: true };
      }
      return door;
    }),
    switches,
    props,
    paintings: corridorPaintings(spec),
    notes: [...notes, ...endingNote(spec)],
    spawn,
    spawnYaw: start ? (start.side === 1 ? Math.PI / 2 : -Math.PI / 2) : Math.PI,
  };
}

/** The hotel as it should be. Also the floor the player starts on. */
export const FLOOR_5 = generateFloor(5, DEFAULT_SEED);
export const FLOOR_5_LAYOUT: FloorLayout = buildFloor(FLOOR_5);
