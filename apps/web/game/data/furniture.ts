import { boxFromBounds } from "./builders";
import {
  CEILING_HEIGHT,
  WINDOW_ACROSS,
  WINDOW_SILL,
  WINDOW_TOP,
  WINDOW_WIDTH,
} from "./dimensions";
import { PROP_SIZES, type PropId } from "./propSizes.generated";
import type { BoxSpec, LampSpec, PropSpec, SurfaceKind, SwitchSpec, Vec3 } from "../types";

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
const LAYOUT: readonly Placement[] = [
  // Bed along the left wall, head to the exterior wall.
  { id: "bed", depth: 3.35, across: -0.98, yaw: 90, blockTo: 0.75 },
  // Wardrobe just inside the door, back to the right wall.
  { id: "wardrobe", depth: 0.95, across: 1.42, yaw: 0 },
  // Desk against the same wall, under the window end, chair tucked in.
  { id: "desk", depth: 2.75, across: 1.24, yaw: 0, scale: 0.85 },
  // The gap between the walkway and the desk is narrower than the chair, so a
  // fully pulled-out chair would block the only route through the room.
  { id: "chair", depth: 2.75, across: 0.68, yaw: -90 },
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

/** Nightstand: neither library has one, so it stays hand-built. */
const NIGHTSTAND = {
  depth: [3.88, 4.40] as Range,
  across: [-0.30, 0.22] as Range,
  height: 0.52,
};

function cabinet(
  frame: RoomFrame,
  depth: Range,
  y: Range,
  across: Range,
  fronts = 2,
): BoxSpec[] {
  const PLINTH = 0.075;
  const TOP = 0.03;
  const OVERHANG = 0.022;
  const body: Range = [y[0] + PLINTH, y[1] - TOP];

  const out: BoxSpec[] = [
    piece(frame, "wood", [depth[0] + 0.03, depth[1] - 0.03], [y[0], y[0] + PLINTH],
      [across[0] + 0.03, across[1] - 0.03]),
    piece(frame, "wood", depth, body, across),
    piece(frame, "wood", [depth[0] - OVERHANG, depth[1] + OVERHANG], [y[1] - TOP, y[1]],
      [across[0] - OVERHANG, across[1] + OVERHANG]),
  ];

  const step = (body[1] - body[0] - 0.05) / fronts;
  const mid = (across[0] + across[1]) / 2;
  for (let i = 0; i < fronts; i += 1) {
    const y0 = body[0] + 0.025 + i * step;
    out.push(
      piece(frame, "trim", [depth[0] - 0.022, depth[0]], [y0 + 0.014, y0 + step - 0.014],
        [across[0] + 0.04, across[1] - 0.04]),
      piece(frame, "metal", [depth[0] - 0.046, depth[0] - 0.022],
        [y0 + step / 2 - 0.011, y0 + step / 2 + 0.011], [mid - 0.07, mid + 0.07]),
    );
  }
  return out;
}

/** Sill, glazing bars, curtains and a pelmet. */
function windowDressing(frame: RoomFrame, depth: number): BoxSpec[] {
  const left = WINDOW_ACROSS - WINDOW_WIDTH / 2;
  const right = WINDOW_ACROSS + WINDOW_WIDTH / 2;
  const middle = (WINDOW_SILL + WINDOW_TOP) / 2;
  return [
    piece(frame, "wood", [depth - 0.22, depth - 0.02], [WINDOW_SILL - 0.05, WINDOW_SILL],
      [left - 0.09, right + 0.09], false),
    piece(frame, "wood", [depth - 0.06, depth - 0.03], [WINDOW_SILL, WINDOW_TOP],
      [WINDOW_ACROSS - 0.02, WINDOW_ACROSS + 0.02], false),
    piece(frame, "wood", [depth - 0.06, depth - 0.03], [middle - 0.02, middle + 0.02],
      [left, right], false),
    piece(frame, "linen", [depth - 0.24, depth - 0.16], [WINDOW_SILL - 0.5, WINDOW_TOP + 0.16],
      [left - 0.24, left + 0.04], false),
    piece(frame, "linen", [depth - 0.24, depth - 0.16], [WINDOW_SILL - 0.5, WINDOW_TOP + 0.16],
      [right - 0.04, right + 0.24], false),
    piece(frame, "wood", [depth - 0.26, depth - 0.14], [WINDOW_TOP + 0.16, WINDOW_TOP + 0.26],
      [left - 0.24, right + 0.24], false),
  ];
}

export interface Furnishing {
  readonly boxes: BoxSpec[];
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
): Furnishing {
  const boxes: BoxSpec[] = [];
  const props: PropSpec[] = [];

  for (const item of LAYOUT) {
    const { prop, collider } = place(frame, roomId, item);
    props.push(prop);
    if (collider) boxes.push(collider);
  }

  boxes.push(
    ...cabinet(frame, NIGHTSTAND.depth, [0, NIGHTSTAND.height], NIGHTSTAND.across, 2),
    ...windowDressing(frame, depth),
    // Drop rod for the ceiling fixture.
    piece(frame, "metal", [2.18, 2.22], [CEILING_HEIGHT - 0.34, CEILING_HEIGHT],
      [-0.02, 0.02], false),
  );

  const lampId = `${roomId}-bedside`;
  const nightstandCentre = {
    depth: (NIGHTSTAND.depth[0] + NIGHTSTAND.depth[1]) / 2,
    across: (NIGHTSTAND.across[0] + NIGHTSTAND.across[1]) / 2,
  };

  const lamps: LampSpec[] = [
    {
      id: lampId,
      // Bulb sits at the shade's centre, above the nightstand top.
      position: localPoint(frame, nightstandCentre.depth, NIGHTSTAND.height + 0.285, nightstandCentre.across),
      fixture: "table",
      castShadow: false,
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
      intensity: 3.4,
      kind: "bare",
      color: "#7d9dd6",
      distance: 7,
    },
    {
      // Fake bounce off the floor. Without it nothing below knee height is lit,
      // and furniture loses contact with the ground.
      id: `${roomId}-bounce`,
      position: localPoint(frame, 2.7, 0.3, -0.3),
      castShadow: false,
      intensity: 7,
      kind: "bare",
      color: "#c99a63",
      distance: 8,
    },
    {
      // The room's one shadow caster: it is what grounds the furniture.
      id: `${roomId}-ceiling`,
      position: localPoint(frame, 2.2, CEILING_HEIGHT - 0.2, 0),
      castShadow: true,
      intensity: 15,
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

  // On the doorway centreline, which the layout keeps clear.
  const spawn = localPoint(frame, 1.3, 0, 0);

  return { boxes, lamps, switches, props, spawn };
}
