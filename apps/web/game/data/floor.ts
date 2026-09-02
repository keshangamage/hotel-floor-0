import { G_FLOOR } from "../systems/elevator";
import { boxFromBounds, room, slab, wallWithOpenings, type Opening } from "./builders";
import {
  CEILING_HEIGHT,
  CORRIDOR_HALF_WIDTH,
  DOOR_HEIGHT,
  DOOR_RECESS,
  DOOR_WIDTH,
  BOARD_DEPTH,
  BOARD_HEIGHT,
  BOARD_HEIGHTS,
  NOSING,
  RAIL_HEIGHT,
  RAIL_SECTION,
  RISER_THICKNESS,
  SLAB_THICKNESS,
  STAIR_DEPTH,
  STAIR_INSET,
  STAIR_SOFFIT,
  STAIR_WIDTH,
  STEP_COUNT,
  STEP_RISE,
  STEP_RUN,
  TREAD_THICKNESS,
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
  BoxSpec, DoorSpec, FloorLayout, FloorSpec, ItemSpec, LampSpec, MirrorSpec, PaintingSpec, NoteSpec,
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

/**
 * The one key in the hotel.
 *
 * One key, not one per floor. The player finds it once and it keeps working
 * all the way down, which is both less to carry and the better idea: a guest
 * whose key opens the same room on a floor that should not have that room is
 * worse than a guest with a pocketful of keys.
 */
export const GUEST_KEY = "key-guest";

/** The notebook the anomalies get written in. */
export const LEDGER = "ledger";

/**
 * What the notebook says when it is opened.
 *
 * The game's one piece of teaching, and it is in the guest's hand rather than
 * the interface's: he worked the rule out before the player did and wrote it
 * to himself. Shown the moment the notebook is picked up, which is the moment
 * the player can act on it.
 */
export const FIRST_PAGE: NoteSpec = {
  id: "ledger-first-page",
  position: [0, 0, 0],
  yaw: 0,
  title: "The first page",
  lines: [
    "Every floor of this hotel is the same floor.",
    "The doors, the numbers, the pictures on the walls,",
    "the notice about breakfast. All of it.",
    "",
    "When one of them is not, write it down.",
    "Press Q. Press R to read back what you have.",
    "",
    "The fifth is only the floor I have seen most of.",
    "That is not the same as it being the right one.",
  ],
};

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
    needs: spec.keyed ? GUEST_KEY : undefined,
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

/**
 * What is behind the locked door.
 *
 * The same page on every floor, and it has to be: the game asks whether
 * anything has changed since the last floor, so a page that differed between
 * them would be a difference the player could not act on, and every floor
 * would read as wrong.
 *
 * Repeating it does not weaken it. A guest counting the lift down, in the same
 * hand, in a locked room on all five floors, is worse the second time than the
 * first, and it is the count the whole descent ends on.
 */
const KEPT = {
  title: "On hotel stationery",
  lines: [
    "The lift takes a long time between floors.",
    "I counted eleven seconds from five to four.",
    "",
    "Eleven seconds is a long way down.",
    "",
    "I have started writing down what I am sure of.",
    "It is not a long list.",
  ],
};

/**
 * The stairwell, boarded shut.
 *
 * The notices have been telling the player to use the lift since the fifth
 * floor. This is what they were talking about, and it is closed on every floor
 * of the building, including the one they cannot leave: when a lift stops
 * answering, the stairs are the first thing anybody tries.
 *
 * Boarded rather than bricked. A wall says there was never a way out of this
 * building; a flight going up into the dark behind three planks says there is
 * one and it is not available.
 */
function stairwell(end: number): { opening: Opening; boxes: BoxSpec[] } {
  const centre = end - STAIR_INSET;
  const side = -1;
  const across: [number, number] = [centre - STAIR_WIDTH / 2, centre + STAIR_WIDTH / 2];
  const shell: [number, number] = [across[0] - WALL_THICKNESS, across[1] + WALL_THICKNESS];
  const order = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);
  /** Metres into the alcove, as an x. */
  const into = (d: number) => side * (OUTER_X + d);
  const run = STEP_COUNT * STEP_RUN;
  const rise = STEP_COUNT * STEP_RISE;
  const back = STAIR_DEPTH + WALL_THICKNESS;

  const boxes: BoxSpec[] = [
    slab("floor", { x: order(into(0), into(back)), y: [-SLAB_THICKNESS, 0], z: shell }),
    // The ceiling covers the lower half only. A flight that stops under a flat
    // slab is a flight to nowhere, and this one has somewhere to be: it climbs
    // out through the opening, which is also the only reason the handrail has
    // anywhere to go.
    slab("ceiling", {
      x: order(into(0), into(STAIR_SOFFIT)),
      y: [CEILING_HEIGHT, CEILING_HEIGHT + SLAB_THICKNESS],
      z: shell,
    }),
    boxFromBounds("wall", {
      x: order(into(STAIR_DEPTH), into(back)),
      y: [0, CEILING_HEIGHT],
      z: shell,
    }),
  ];
  for (const edge of [shell[0], across[1]]) {
    boxes.push(boxFromBounds("wall", {
      x: order(into(0), into(back)),
      y: [0, CEILING_HEIGHT],
      z: [edge, edge + WALL_THICKNESS],
    }));
  }

  // A riser and a tread each, rather than a column standing on the floor.
  // Closed risers hide the underside just as well, and every riser is the same
  // box as every other, where twelve columns are twelve different heights and
  // so twelve geometries the cache cannot share.
  for (let i = 0; i < STEP_COUNT; i += 1) {
    const top = (i + 1) * STEP_RISE;
    boxes.push(boxFromBounds("wood", {
      x: order(into(i * STEP_RUN), into(i * STEP_RUN + RISER_THICKNESS)),
      y: [i * STEP_RISE, top - TREAD_THICKNESS],
      z: across,
    }));
    // Standing proud of the riser under it, which is what casts the line of
    // shadow that reads as a stair from across a corridor.
    boxes.push(boxFromBounds("wood", {
      x: order(into(i * STEP_RUN - NOSING), into((i + 1) * STEP_RUN)),
      y: [top - TREAD_THICKNESS, top],
      z: across,
    }));
  }

  // A handrail against one wall, following the pitch. This is the only thing
  // in the building that is not square to the world, and it is the difference
  // between a staircase and a stack of blocks.
  boxes.push({
    kind: "wood",
    position: [into(run / 2), rise / 2 + RAIL_HEIGHT, across[0] + RAIL_SECTION],
    size: [Math.hypot(run, rise), RAIL_SECTION, RAIL_SECTION],
    collides: false,
    rotation: [0, 0, -Math.atan2(rise, run)],
  });

  // The flight collides as one slab under the pitch line. Architecture rather
  // than furniture, so it is a wall: nothing can reach it while the boards are
  // up, but a stair the player could walk through is not a stair.
  boxes.push(boxFromBounds("wall", {
    x: order(into(0), into(run)),
    y: [0, rise],
    z: across,
  }, true, false));

  // The boards do not collide. One invisible panel across the whole aperture
  // does that, so the gaps between them cannot be walked through.
  for (const y of BOARD_HEIGHTS) {
    boxes.push(boxFromBounds("wood", {
      x: order(side * CORRIDOR_HALF_WIDTH, side * (CORRIDOR_HALF_WIDTH + BOARD_DEPTH)),
      y: [y, y + BOARD_HEIGHT],
      z: across,
    }, false));
  }
  boxes.push(boxFromBounds("wall", {
    x: order(side * CORRIDOR_HALF_WIDTH, side * OUTER_X),
    y: [0, DOOR_HEIGHT],
    z: across,
  }, true, false));

  return {
    opening: { at: centre, width: STAIR_WIDTH, height: DOOR_HEIGHT, recess: 0, leaf: "open" },
    boxes,
  };
}

export function buildFloor(spec: FloorSpec): FloorLayout {
  const { corridorFrom: from, corridorTo: end } = spec;
  const length: [number, number] = [from, end];
  const full: [number, number] = [-OUTER_X, OUTER_X];
  const stairs = stairwell(end);

  const boxes: BoxSpec[] = [
    ...stairs.boxes,
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
      openings: [...spec.rooms.filter((r) => r.side === -1).map(doorway), stairs.opening],
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
  const items: ItemSpec[] = [];
  const mirrors: MirrorSpec[] = [];
  const keyedRoom = spec.rooms.find((r) => r.keyed);

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

    // The locked room holds one page and nothing else: no lamp, no furniture,
    // and no reason to be in there except the thing the key was for.
    if (spec_.keyed) {
      const middle = roomCentre(spec_);

      // A telephone on the floor of an empty room. It is here on every floor,
      // ringing or not, because a fixture that only existed when it rang could
      // be found by looking rather than by listening.
      const phone: Vec3 = [middle[0] + spec_.side * 0.5, 0, middle[2] + 0.7];
      // A room the player has to unlock to look into, so this is the deepest
      // thing on the floor to miss: they have to have been in here before, on
      // a floor where nothing was wrong, to know what is not here now.
      const hasPhone = spec.anomaly?.kind !== "phone-gone";
      if (hasPhone) props.push({
        instanceId: `telephone-${spec_.number}`,
        id: "telephone",
        position: phone,
        yaw: spec_.side * Math.PI / 2,
      });
      // Art collides through an invisible box, like every other piece, and a
      // telephone that is not there does not collide either.
      if (hasPhone) {
        const [wide, tall, deep] = PROP_SIZES.telephone;
        boxes.push(boxFromBounds("wood", {
          x: [phone[0] - deep / 2, phone[0] + deep / 2],
          y: [0, tall],
          z: [phone[2] - wide / 2, phone[2] + wide / 2],
        }, true, false));
      }

      // A spare cell, in the room the key opens. The page is read once and the
      // telephone only rings sometimes, so without this the key stops being
      // worth the walk after the first floor.
      items.push({
        instanceId: `cell-${spec.floorNumber}`,
        id: "battery",
        keep: false,
        position: [phone[0] - spec_.side * 0.34, 0.02, phone[2] - 0.22],
        yaw: spec_.side * Math.PI / 2,
        label: "cell",
      });

      notes.push({
        // Floor free: one per floor, and the notes must compare equal across them.
        id: "kept-note",
        position: [middle[0], 0.01, middle[2]],
        yaw: spec_.side * Math.PI / 2,
        title: KEPT.title,
        lines: KEPT.lines,
      });
    }

    // A mirror on the wall the door is in, so it is behind the player as they
    // come in and they meet it by turning round. Inside a room, which is what
    // keeps the second render pass off the corridor: from out there it is
    // behind a wall and culled before it costs anything.
    if (spec_.furnished && spec.anomaly?.kind !== "mirror-gone") {
      mirrors.push({
        id: `mirror-${spec_.number}`,
        position: [spec_.side * (OUTER_X + 0.03), 1.45, spec_.doorZ + spec_.side * 1.05],
        yaw: (spec_.side * Math.PI) / 2,
        width: 0.62,
        height: 0.84,
      });
    }

    if (!spec_.furnished) continue;

    const furnishing = furnishHotelRoom(
      frame, spec_.depth, spec_.width, `room-${spec_.number}`,
      spec.anomaly?.kind,
    );
    // The key, left on the desk of the room that is open. Named for the door
    // it opens, so carrying it is the whole of being able to open that door.
    if (keyedRoom) {
      const desk = furnishing.props.find((prop) => prop.id === "desk");
      const on: Vec3 = desk
        ? [desk.position[0], desk.position[1] + PROP_SIZES.desk[1], desk.position[2]]
        : [roomCentre(spec_)[0], 0.01, roomCentre(spec_)[2]];
      // The guest's notebook, beside the key. The page behind the locked door
      // says he had started writing down what he was sure of; this is what he
      // was writing in, and it is the only thing in the game that lets the
      // player do anything at all about an anomaly.
      items.push({
        instanceId: `ledger-${spec.floorNumber}`,
        id: LEDGER,
        keep: true,
        position: [on[0], on[1], on[2] + spec_.side * 0.26],
        yaw: spec_.side * Math.PI / 2,
        label: "notebook",
      });

      // The key, gone from the desk it is left on. A player who already has
      // one loses nothing by it, since the key is kept: for them this is an
      // empty desk where a key has been every other time. For one who has not
      // picked it up yet it is the locked room, closed for the floor.
      if (spec.anomaly?.kind !== "key-gone") items.push({
        instanceId: `key-${spec.floorNumber}`,
        id: GUEST_KEY,
        keep: true,
        position: on,
        yaw: spec_.side * Math.PI / 2,
        label: "room key",
      });
    }

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
    id: lamp.id,
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
    items,
    mirrors,
    spawn,
    spawnYaw: start ? (start.side === 1 ? Math.PI / 2 : -Math.PI / 2) : Math.PI,
  };
}

/** The hotel as it should be. Also the floor the player starts on. */
export const FLOOR_5 = generateFloor(5, DEFAULT_SEED);
export const FLOOR_5_LAYOUT: FloorLayout = buildFloor(FLOOR_5);
