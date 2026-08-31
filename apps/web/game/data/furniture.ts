import type { AnomalyKind } from "../systems/anomaly";
import { boxFromBounds } from "./builders";
import {
  CEILING_HEIGHT,
  WINDOW_ACROSS,
  WINDOW_FRAME_BASE,
  WINDOW_SCALE,
  WINDOW_SILL,
  WINDOW_TOP,
} from "./dimensions";
import { PROP_SIZES, type PropId } from "./propSizes.generated";
import type { BoxSpec, LampSpec, NoteSpec, PropSpec, SurfaceKind, SwitchSpec, Vec3 } from "../types";

/**
 * Rooms are furnished in a local frame:
 *
 *   depth   0 at the doorway, increasing into the room
 *   across  0 on the doorway's centreline, positive to the right as you enter
 *
 * Rooms on the -X wall are the same frame rotated 180 degrees, not mirrored.
 * A mirror flips handedness and would render every prop back to front.
 */
export interface RoomFrame {
  readonly side: 1 | -1;
  /** Distance from the corridor centreline to the room's inner face. */
  readonly nearX: number;
  /** Doorway centre, along Z. */
  readonly doorZ: number;
}

type Range = readonly [number, number];

function localPoint(frame: RoomFrame, depth: number, y: number, across: number): Vec3 {
  return [
    frame.side * (frame.nearX + depth),
    y,
    frame.doorZ + frame.side * across,
  ];
}

const worldYaw = (frame: RoomFrame, yaw: number) => yaw + (frame.side === 1 ? 0 : Math.PI);

function piece(
  frame: RoomFrame,
  kind: SurfaceKind,
  depth: Range,
  y: Range,
  across: Range,
  collides = true,
  visible = true,
): BoxSpec {
  const a = localPoint(frame, depth[0], 0, across[0]);
  const b = localPoint(frame, depth[1], 0, across[1]);
  return boxFromBounds(
    kind,
    {
      x: a[0] < b[0] ? [a[0], b[0]] : [b[0], a[0]],
      y,
      z: a[2] < b[2] ? [a[2], b[2]] : [b[2], a[2]],
    },
    collides,
    visible,
  );
}

/**
 * One placed prop. Its collider is derived from the measured mesh, so the two
 * can never disagree.
 *
 * `yaw` is a quarter turn in the room's frame. At 0 the prop's X axis runs
 * along depth and its Z axis along across; at +/-90 they swap.
 */
interface Placement {
  readonly id: PropId;
  readonly depth: number;
  readonly across: number;
  readonly yaw?: 0 | 90 | 180 | -90;
  readonly scale?: number;
  /** Height of the collider. Defaults to the mesh height. */
  readonly blockTo?: number;
  /** Rugs and ceiling fixtures are walked on or under, not around. */
  readonly solid?: boolean;
  /** Height off the floor, for hung fixtures. */
  readonly y?: number;
}

/** Footprint in the room's frame, accounting for the quarter turn. */
function footprint(place: Placement): { depth: number; across: number; height: number } {
  const [x, y, z] = PROP_SIZES[place.id];
  const scale = place.scale ?? 1;
  const turned = place.yaw === 90 || place.yaw === -90;
  return {
    depth: (turned ? z : x) * scale,
    across: (turned ? x : z) * scale,
    height: y * scale,
  };
}

function place(frame: RoomFrame, roomId: string, item: Placement) {
  const size = footprint(item);
  const prop: PropSpec = {
    instanceId: `${roomId}-${item.id}`,
    id: item.id,
    position: localPoint(frame, item.depth, item.y ?? 0, item.across),
    yaw: worldYaw(frame, ((item.yaw ?? 0) * Math.PI) / 180),
    scale: item.scale,
  };

  if (item.solid === false) return { prop, collider: null };

  const collider = piece(
    frame,
    "wood",
    [item.depth - size.depth / 2, item.depth + size.depth / 2],
    [item.y ?? 0, (item.y ?? 0) + (item.blockTo ?? size.height)],
    [item.across - size.across / 2, item.across + size.across / 2],
    true,
    // Imported meshes draw themselves; this box is collision only.
    false,
  );
  return { prop, collider };
}

/**
 * Layout for a standard hotel room, 4.5m deep by 3.4m across.
 *
 * The doorway centreline is kept clear from the door to the far wall, so the
 * player always has a way in and to the window.
 */
/** Bedside table, kept in one place so the lamp sits on top of it. */
const NIGHTSTAND = { depth: 4.21, across: -0.04 } as const;

const LAYOUT: readonly Placement[] = [
  // Bed along the left wall, head to the exterior wall. This model's long axis
  // is X, so it needs no quarter turn.
  { id: "bed", depth: 3.45, across: -1.06, yaw: 0, blockTo: 0.72 },
  // Bedside table against the far wall. It faces +Z, so a quarter turn points
  // it back into the room rather than along the wall.
  { id: "nightstand", depth: NIGHTSTAND.depth, across: NIGHTSTAND.across, yaw: -90 },
  // Shelf just inside the door, back to the left wall. It opens toward +Z,
  // which at yaw 0 faces into the room with its back to the wall.
  { id: "wardrobe", depth: 0.95, across: -1.48, yaw: 0 },
  // Desk against the right wall, under the window end, chair tucked in. Sized
  // by the build, so it needs no scale here.
  { id: "desk", depth: 2.75, across: 1.24, yaw: 0 },
  // The gap between the walkway and the desk is narrower than the chair, so a
  // fully pulled-out chair would block the only route through the room. This
  // model faces +Z, which is toward the desk at yaw 0.
  { id: "chair", depth: 2.75, across: 0.68, yaw: 0 },
  // Rug over the open floor, set flush so furniture legs do not clip through
  // it. Walked on, so no collider.
  { id: "rug", depth: 2.00, across: 0.15, yaw: 0, scale: 0.55, solid: false, y: -0.006 },
  // Ceiling fixture, clear of head height.
  {
    id: "chandelier",
    depth: 2.20,
    across: 0,
    scale: 0.5,
    solid: false,
    y: CEILING_HEIGHT - PROP_SIZES.chandelier[1] * 0.5,
  },
];

export interface Furnishing {
  readonly boxes: BoxSpec[];
  readonly notes: NoteSpec[];
  readonly lamps: LampSpec[];
  readonly switches: SwitchSpec[];
  readonly props: PropSpec[];
  /** Clear floor to stand on. */
  readonly spawn: Vec3;
}

export function furnishHotelRoom(
  frame: RoomFrame,
  depth: number,
  _width: number,
  roomId: string,
  /** What is wrong with this floor, for the anomalies the room carries. */
  wrong?: AnomalyKind,
): Furnishing {
  const alteredNotice = wrong === "notice-changed";
  const boxes: BoxSpec[] = [];
  const props: PropSpec[] = [];

  for (const item of LAYOUT) {
    // The chair belongs tucked under the desk. Out in the floor, turned to
    // face the door, is the same room saying something different.
    const placed = wrong === "furniture-moved" && item.id === "chair"
      ? { ...item, depth: 1.75, across: -0.55, yaw: 180 as const }
      : item;
    const { prop, collider } = place(frame, roomId, placed);
    props.push(prop);
    if (collider) boxes.push(collider);
  }

  boxes.push(
    // Drop rod for the ceiling fixture.
    piece(frame, "metal", [2.18, 2.22], [CEILING_HEIGHT - 0.34, CEILING_HEIGHT],
      [-0.02, 0.02], false),
  );

  // The window unit stands in the wall opening, facing back into the room.
  props.push(place(frame, roomId, {
    id: "window",
    depth: depth - (PROP_SIZES.window[2] * WINDOW_SCALE) / 2,
    across: WINDOW_ACROSS,
    yaw: -90,
    scale: WINDOW_SCALE,
    y: WINDOW_FRAME_BASE,
    solid: false,
  }).prop);

  const lampId = `${roomId}-bedside`;

  const lamps: LampSpec[] = [
    {
      id: lampId,
      // Bulb sits at the shade's centre, above the nightstand top.
      position: localPoint(frame, NIGHTSTAND.depth, PROP_SIZES.nightstand[1] + 0.285, NIGHTSTAND.across),
      fixture: "table",
      castShadow: false,
      // Out, but still standing there. The fixture is what makes it read as
      // switched off rather than missing.
      lit: wrong !== "bedside-dark",
      intensity: 2.8,
      kind: "bare",
      color: "#ffb877",
      distance: 4.5,
    },
    {
      // Cold spill through the window.
      id: `${roomId}-window`,
      position: localPoint(frame, depth + 0.5, (WINDOW_SILL + WINDOW_TOP) / 2, WINDOW_ACROSS),
      castShadow: false,
      intensity: 2.8,
      kind: "bare",
      color: "#7d9dd6",
      distance: 7,
    },
    {
      // Fake bounce off the floor, so something lights below knee height.
      // Kept low: it is fill, so it lifts the whole room evenly, and occlusion
      // now does most of the grounding it was carrying.
      id: `${roomId}-bounce`,
      position: localPoint(frame, 2.7, 0.3, -0.3),
      castShadow: false,
      intensity: 3,
      kind: "bare",
      color: "#c99a63",
      distance: 8,
    },
    {
      // The room's one shadow caster: it is what grounds the furniture.
      id: `${roomId}-ceiling`,
      position: localPoint(frame, 2.2, CEILING_HEIGHT - 0.2, 0),
      castShadow: true,
      intensity: 10,
      kind: "spot",
      color: "#ffcf9e",
      distance: 9.5,
    },
  ];

  const switches: SwitchSpec[] = [
    {
      id: `${roomId}-switch`,
      position: localPoint(frame, 0.18, 1.15, -0.62),
      yaw: worldYaw(frame, 0),
      targetLampId: lampId,
    },
  ];

  /**
   * The rules, as the hotel would put them.
   *
   * The game never explains itself anywhere else, and two unlabelled buttons in
   * a lift are not a rule. Saying it in the hotel's own voice keeps the telling
   * inside the fiction.
   */
  const notes: NoteSpec[] = [
    {
      id: `${roomId}-notice`,
      // On the desk, where hotel stationery lives.
      position: localPoint(frame, 2.75, PROP_SIZES.desk[1] + 0.005, 1.05),
      yaw: worldYaw(frame, 0),
      title: "Notice to guests",
      // The altered notice swaps the two instructions. A player who reads it
      // and obeys is led the wrong way, but a player who remembers the one in
      // their own room sees it for what it is, which is the whole game.
      // The lift takes a verdict, not a direction: both answers carry the
      // guest down when they are right. Wording it as up and down told them
      // the opposite of what the floor indicator then did.
      lines: alteredNotice
        ? [
            "The fifth floor is the ground floor.",
            "",
            "Should the floor you are on differ in any way",
            "from this one, tell the lift that it does not.",
            "",
            "Should it not differ, tell the lift that it does.",
            "",
            "Answer wrongly and you will be returned to the fifth.",
            "",
            "The stairs are not in service.",
          ]
        : [
            "The fifth floor is the ground floor.",
            "",
            "Should the floor you are on differ in any way",
            "from this one, tell the lift so.",
            "",
            "Should it not differ, tell the lift that instead.",
            "",
            "Answer wrongly and you will be returned to the fifth.",
            "",
            "The stairs are not in service.",
          ],
    },
  ];

  /**
   * Left by whoever had the room before.
   *
   * The same note in every room on every floor, which is the only way it can
   * exist at all: anything that differed between floors would read as an
   * anomaly. Identical everywhere is also the worse answer, and the player
   * gets there on their own the second time they find it.
   */
  notes.push({
    id: `${roomId}-guest`,
    // On the nightstand, beside the lamp rather than under it.
    position: localPoint(frame, 4.15, PROP_SIZES.nightstand[1] + 0.005, -0.3),
    yaw: worldYaw(frame, Math.PI / 2),
    title: "Left on the nightstand",
    lines: [
      "I have counted the floors four times.",
      "",
      "The lift agrees with the doors. The doors agree",
      "with each other. I have checked them twice.",
      "",
      "It is the corridor. It was shorter yesterday.",
      "I have stopped telling them.",
      "",
      "If you are reading this, do not go down to see.",
    ],
  });

  // On the doorway centreline, which the layout keeps clear.
  const spawn = localPoint(frame, 1.3, 0, 0);

  return { boxes, lamps, switches, props, notes, spawn };
}
