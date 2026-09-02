import type { FloorSpec } from "../types";

/**
 * Someone else on the floor.
 *
 * Only the floors under the hotel have anyone standing on them, and never the
 * ones the player is judging: a figure is not an anomaly. They are not being
 * asked whether it belongs there, which is why it is allowed to be obvious.
 */
/** Outer face of the corridor wall, which is where a room begins. */
const OUTER_FACE = 1.15;

export interface Stand {
  readonly x: number;
  readonly z: number;
}

/** How long it tolerates being looked at straight on, in seconds. */
export const LINGER = 0.45;

/** It is gone before the player can reach it. Nothing here can be touched. */
export const TOO_CLOSE = 2.6;

/**
 * How much of the lobby it keeps clear of, in metres.
 *
 * The player arrives standing in the lift doorway. A pool of light close to it
 * is no use: anything standing there is already inside TOO_CLOSE on the first
 * frame, so it would be gone before the doors finished opening and the floor
 * would simply be empty.
 */
const LOBBY_CLEARANCE = 4;

/** Head height, near enough. What the look is measured against. */
export const STAND_HEIGHT = 1.5;

/**
 * Where it is standing, or null if this floor is empty of it.
 *
 * Always in a pool of light. A dark shape in a dark corridor is not frightening
 * because it cannot be seen at all: at this fog density anything unlit is the
 * same colour as the air. Standing it under a lamp is what makes it a figure
 * rather than a rumour, and the escalation is which lamp.
 */
/**
 * How deep the player has been before it will stand on the fifth floor.
 *
 * The last floor above the one they cannot leave. By then they have judged
 * every floor of the hotel proper and have nothing left to do up there except
 * check, which is exactly when checking should stop being safe.
 */
export const OPENS_AT = 1;

export function presenceOn(spec: FloorSpec, deepest = Infinity): Stand | null {
  // Standing in the room, when the mirror on that floor is the fault.
  //
  // It is not the reflection that is wrong: it is the room, and the mirror is
  // the only way to see it. Looking straight at this thing is what makes it
  // not be there, and looking at a mirror is not looking at it, so what the
  // player gets is somebody over their shoulder who is not behind them when
  // they turn. Deep enough into the room that they can see it from the door
  // before walking into the distance that ends it.
  if (spec.anomaly?.kind === "mirror-wrong") {
    const room = spec.rooms.find((r) => r.furnished);
    if (room) return { x: room.side * (OUTER_FACE + room.depth * 0.78), z: room.doorZ };
  }

  // Ascending z runs from the dead end towards the lift.
  const pools = spec.lamps
    .filter((lamp) => lamp.lit && lamp.z <= spec.corridorTo - LOBBY_CLEARANCE)
    .map((lamp) => lamp.z)
    .sort((a, b) => a - b);
  if (pools.length === 0) return null;

  const far = pools[0];
  const middle = pools[Math.floor(pools.length / 2)];
  const near = pools[pools.length - 1];

  switch (spec.floorNumber) {
    // The fifth, once they have been all the way down and come back up.
    //
    // The reference floor. Every judgement they have made rests on it being
    // the one place nothing happens, and the notebook they are carrying says
    // in the guest's own hand that this is not the same as it being right.
    // Far off, and on the floor they started on, so it is almost certainly the
    // first time they see it at all.
    case 5: return deepest <= OPENS_AT && far !== undefined ? { x: 0.52, z: far } : null;
    // The length of the corridor away, off to one side, easy to take for a coat.
    case -1: return far === undefined ? null : { x: 0.52, z: far };
    // Halfway, and in the middle of the floor, so it has to be walked around.
    case -2: return middle === undefined ? null : { x: 0, z: middle };
    // The last pool before the lift. The doors open onto it.
    case -3: return near === undefined ? null : { x: 0, z: near };
    default: return null;
  }
}
