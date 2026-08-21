import { boxFromBounds } from "./builders";
import type { BoxSpec, LampSpec, SurfaceKind, Vec3 } from "../types";

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
  );
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

function desk(frame: RoomFrame, depth: Range, across: Range): BoxSpec[] {
  const top: Range = [0.72, 0.76];
  return [
    piece(frame, "wood", depth, top, across),
    piece(frame, "wood", [depth[0], depth[0] + 0.05], [0, top[0]], [across[0], across[0] + 0.05]),
    piece(frame, "wood", [depth[1] - 0.05, depth[1]], [0, top[0]], [across[0], across[0] + 0.05]),
    piece(frame, "wood", [depth[0], depth[0] + 0.05], [0, top[0]], [across[1] - 0.05, across[1]]),
    piece(frame, "wood", [depth[1] - 0.05, depth[1]], [0, top[0]], [across[1] - 0.05, across[1]]),
  ];
}

function chair(frame: RoomFrame, depth: number, across: number): BoxSpec[] {
  const d: Range = [depth - 0.22, depth + 0.22];
  const a: Range = [across - 0.22, across + 0.22];
  return [
    piece(frame, "wood", d, [0.42, 0.47], a),
    piece(frame, "wood", [d[1] - 0.05, d[1]], [0.47, 0.92], a),
  ];
}

export interface Furnishing {
  readonly boxes: BoxSpec[];
  readonly lamps: LampSpec[];
  /** Clear floor to stand on. The furnisher knows where the gaps are. */
  readonly spawn: Vec3;
}

/**
 * A standard hotel room. Room 507 uses this, and every other room can once
 * their doors open.
 */
export function furnishHotelRoom(frame: RoomFrame, depth: number, width: number): Furnishing {
  const back = depth - 0.05;
  const left = -width / 2;
  const right = width / 2;

  const boxes: BoxSpec[] = [
    // Rug, flat on the floor and not something to trip over.
    piece(frame, "fabric", [1.1, 3.2], [0.001, 0.012], [left + 0.5, right - 0.5], false),

    ...bed(frame, [back - 2.05, back], [left + 0.05, left + 1.45]),

    // Nightstand beside the bed, with a lamp on top.
    ...cabinet(frame, [back - 0.55, back - 0.05], [0, 0.52], [left + 1.6, left + 2.1]),
    piece(frame, "metal", [back - 0.38, back - 0.22], [0.52, 0.62], [left + 1.74, left + 1.9]),
    piece(frame, "fabric", [back - 0.45, back - 0.15], [0.62, 0.82], [left + 1.67, left + 1.97]),

    ...desk(frame, [1.5, 2.6], [right - 0.55, right - 0.05]),
    ...chair(frame, 2.05, right - 0.85),

    ...cabinet(frame, [0.35, 0.95], [0, 2.0], [0.62, right - 0.05]),

    // Framed print on the wall opposite the bed.
    piece(frame, "wood", [0.02, 0.05], [1.25, 1.85], [right - 2.6, right - 1.8], false),
  ];

  const lamps: LampSpec[] = [
    {
      position: localPoint(frame, back - 0.3, 0.74, left + 1.82),
      castShadow: false,
      intensity: 3.2,
      kind: "bare",
      color: "#ffb877",
      distance: 6,
    },
  ];

  // In line with the doorway, clear of the wardrobe, desk and bed.
  const spawn = localPoint(frame, 1.3, 0, 0);

  return { boxes, lamps, spawn };
}

/** Cold spill from outside, so the window reads as a light source at night. */
export function windowLight(frame: RoomFrame, depth: number, across: number, height: number): LampSpec {
  return {
    position: localPoint(frame, depth + 0.5, height, across),
    castShadow: false,
    intensity: 2.6,
    kind: "bare",
    color: "#7d9dd6",
    distance: 7,
  };
}
