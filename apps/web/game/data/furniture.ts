import { boxFromBounds } from "./builders";
import type { BoxSpec, LampSpec, PropSpec, SurfaceKind, SwitchSpec, Vec3 } from "../types";

/**
 * Furniture is authored in room-local coordinates and mirrored onto whichever
 * side of the corridor the room sits on.
 *
 * Local axes: `depth` runs from the door wall into the room, `across` runs
 * along the corridor from the doorway centre, `y` is height.
 */
export interface RoomFrame {
  readonly side: 1 | -1;
  /** Distance from the corridor centreline to the room's inner face. */
  readonly nearX: number;
  /** Doorway centre, along Z. */
  readonly doorZ: number;
}

type Range = readonly [number, number];

function piece(
  frame: RoomFrame,
  kind: SurfaceKind,
  depth: Range,
  y: Range,
  across: Range,
  collides = true,
  visible = true,
): BoxSpec {
  const a = frame.side * (frame.nearX + depth[0]);
  const b = frame.side * (frame.nearX + depth[1]);
  return boxFromBounds(
    kind,
    {
      x: a < b ? [a, b] : [b, a],
      y,
      z: [frame.doorZ + across[0], frame.doorZ + across[1]],
    },
    collides,
    visible,
  );
}

/** Invisible box standing in for an imported mesh's collision. */
function blocker(frame: RoomFrame, depth: Range, y: Range, across: Range): BoxSpec {
  return piece(frame, "wood", depth, y, across, true, false);
}

function localPoint(frame: RoomFrame, depth: number, y: number, across: number): Vec3 {
  return [frame.side * (frame.nearX + depth), y, frame.doorZ + across];
}

/** Double bed: base, mattress, headboard and two pillows. */
function bed(frame: RoomFrame, depth: Range, across: Range): BoxSpec[] {
  const [d0, d1] = depth;
  const [a0, a1] = across;
  return [
    piece(frame, "wood", [d1, d1 + 0.08], [0.35, 1.05], across),
    piece(frame, "wood", [d0, d1], [0.12, 0.46], across),
    piece(frame, "fabric", [d0 + 0.04, d1 - 0.04], [0.46, 0.68], [a0 + 0.04, a1 - 0.04]),
    piece(frame, "fabric", [d1 - 0.55, d1 - 0.15], [0.68, 0.78], [a0 + 0.08, (a0 + a1) / 2 - 0.04]),
    piece(frame, "fabric", [d1 - 0.55, d1 - 0.15], [0.68, 0.78], [(a0 + a1) / 2 + 0.04, a1 - 0.08]),
  ];
}

/** Simple carcass furniture: a box with a lighter front panel. */
function cabinet(frame: RoomFrame, depth: Range, y: Range, across: Range): BoxSpec[] {
  return [
    piece(frame, "wood", depth, y, across),
    piece(frame, "trim", [depth[0] - 0.02, depth[0]], [y[0] + 0.06, y[1] - 0.06], [across[0] + 0.05, across[1] - 0.05]),
  ];
}

/** Measured from props.glb, so colliders match the imported meshes. */
const PROP_SIZE = {
  desk: [1.95, 0.832, 0.702],
  armchair: [0.917, 1.809, 1.095],
} as const;

export interface Furnishing {
  readonly boxes: BoxSpec[];
  readonly lamps: LampSpec[];
  readonly switches: SwitchSpec[];
  readonly props: PropSpec[];
  /** Clear floor to stand on. The furnisher knows where the gaps are. */
  readonly spawn: Vec3;
}

/**
 * A standard hotel room. Room 507 uses this, and every other room can once
 * their doors open.
 */
export function furnishHotelRoom(
  frame: RoomFrame,
  depth: number,
  width: number,
  roomId: string,
): Furnishing {
  const back = depth - 0.05;
  const left = -width / 2;
  const right = width / 2;

  // The desk runs along the room's depth axis, against the far side wall.
  const deskDepth = 2.0;
  const deskAcross = right - 0.4;
  // Set back beside the window, clear of both the desk and the path to the door.
  const chairDepth = 3.6;
  const chairAcross = 1.0;

  const boxes: BoxSpec[] = [
    // Rug, flat on the floor and not something to trip over.
    piece(frame, "fabric", [1.1, 3.2], [0.001, 0.012], [left + 0.5, right - 0.5], false),

    ...bed(frame, [back - 2.05, back], [left + 0.05, left + 1.45]),

    // Nightstand beside the bed, with a lamp on top.
    ...cabinet(frame, [back - 0.55, back - 0.05], [0, 0.52], [left + 1.6, left + 2.1]),
    piece(frame, "metal", [back - 0.38, back - 0.22], [0.52, 0.62], [left + 1.74, left + 1.9]),
    piece(frame, "fabric", [back - 0.45, back - 0.15], [0.62, 0.82], [left + 1.67, left + 1.97]),

    // Desk and chair are imported meshes; these are their colliders only.
    blocker(frame, [deskDepth - 0.975, deskDepth + 0.975], [0, PROP_SIZE.desk[1]], [deskAcross - 0.35, deskAcross + 0.35]),
    blocker(frame, [chairDepth - 0.46, chairDepth + 0.46], [0, PROP_SIZE.armchair[1]], [chairAcross - 0.55, chairAcross + 0.55]),

    ...cabinet(frame, [0.35, 0.95], [0, 2.0], [0.62, right - 0.05]),

    // Framed print on the wall opposite the bed.
    piece(frame, "wood", [0.02, 0.05], [1.25, 1.85], [right - 2.6, right - 1.8], false),
  ];

  const lampId = `${roomId}-bedside`;
  const lamps: LampSpec[] = [
    {
      id: lampId,
      position: localPoint(frame, back - 0.3, 0.74, left + 1.82),
      castShadow: false,
      intensity: 5.5,
      kind: "bare",
      color: "#ffb877",
      distance: 6,
    },
  ];

  // In line with the doorway, clear of the wardrobe, desk and bed.
  const spawn = localPoint(frame, 1.3, 0, 0);

  // Switch on the wall just inside the door, where you would reach for it.
  const switches: SwitchSpec[] = [
    {
      id: `${roomId}-switch`,
      position: localPoint(frame, 0.18, 1.15, -0.62),
      yaw: frame.side === 1 ? 0 : Math.PI,
      targetLampId: lampId,
    },
  ];

  const props: PropSpec[] = [
    {
      instanceId: `${roomId}-desk`,
      id: "desk",
      position: localPoint(frame, deskDepth, 0, deskAcross),
      yaw: 0,
    },
    {
      instanceId: `${roomId}-armchair`,
      id: "armchair",
      position: localPoint(frame, chairDepth, 0, chairAcross),
      yaw: frame.side === 1 ? -Math.PI / 2 : Math.PI / 2,
    },
  ];

  return { boxes, lamps, switches, props, spawn };
}

/** Cold spill from outside, so the window reads as a light source at night. */
export function windowLight(frame: RoomFrame, depth: number, across: number, height: number): LampSpec {
  return {
    position: localPoint(frame, depth + 0.5, height, across),
    castShadow: false,
    intensity: 3.4,
    kind: "bare",
    color: "#7d9dd6",
    distance: 7,
  };
}
