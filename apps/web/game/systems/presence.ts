import type { FloorSpec } from "../types";

/**
 * Someone else on the floor.
 *
 * Only the floors under the hotel have anyone standing on them, and never the
 * ones the player is judging: a figure is not an anomaly. They are not being
 * asked whether it belongs there, which is why it is allowed to be obvious.
 */
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
export function presenceOn(spec: FloorSpec): Stand | null {
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
    // The length of the corridor away, off to one side, easy to take for a coat.
    case -1: return far === undefined ? null : { x: 0.52, z: far };
    // Halfway, and in the middle of the floor, so it has to be walked around.
    case -2: return middle === undefined ? null : { x: 0, z: middle };
    // The last pool before the lift. The doors open onto it.
    case -3: return near === undefined ? null : { x: 0, z: near };
    default: return null;
  }
}
