import type { Point3 } from "../types";

/**
 * Whether the player is looking at something.
 *
 * This is the question the brief's anomalies turn on: a chair moves when it is
 * not being watched, a door opens behind you, a painting changes as you pass.
 * All of them need one honest answer to "can they see it right now".
 *
 * Deliberately generous about what counts as seen. A thing that rearranges
 * itself at the edge of vision reads as a glitch; a thing that only ever moves
 * while the player is turned away reads as something waiting for them to look
 * elsewhere.
 */

/** Half angle of the cone counted as watched, in radians. Wider than the lens. */
const HALF_ANGLE = 0.95;
/** Beyond this a thing is too far to be watched closely. */
const RANGE = 14;
/**
 * Extra angle before something counts as unseen again.
 *
 * Without it a target sitting exactly on the edge flickers between watched and
 * not as the player breathes, and a chair that creeps on every frame of that
 * is a chair sliding across the floor.
 */
const HYSTERESIS = 0.25;

/**
 * Half angle counted as looking straight at something, in radians.
 *
 * Narrower than the lens, where HALF_ANGLE is wider, because it answers the
 * opposite question. "Has the player turned away" should be generous; "is the
 * player looking right at it" has to mean the middle of the screen, or a thing
 * that flinches from being looked at can never be on screen at all.
 */
const DIRECT_ANGLE = 0.22;

export interface Watcher {
  /** Where the player is, and the way they are facing. */
  readonly at: Point3;
  readonly facing: Point3;
}

/** Angle between the way the player faces and the direction of a point. */
function offAxis(watcher: Watcher, target: Point3): number {
  const dx = target.x - watcher.at.x;
  const dy = target.y - watcher.at.y;
  const dz = target.z - watcher.at.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-6) return 0;

  const dot = (dx * watcher.facing.x + dy * watcher.facing.y + dz * watcher.facing.z) / distance;
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}

export const distanceTo = (watcher: Watcher, target: Point3): number =>
  Math.hypot(target.x - watcher.at.x, target.y - watcher.at.y, target.z - watcher.at.z);

/**
 * Whether a target is watched, given whether it was a moment ago.
 *
 * Takes the previous answer so the edge of vision has some width: something
 * already being watched stays watched a little further round than it took to
 * notice in the first place.
 */
export function isWatched(watcher: Watcher, target: Point3, wasWatched: boolean): boolean {
  if (distanceTo(watcher, target) > RANGE) return false;
  const limit = wasWatched ? HALF_ANGLE + HYSTERESIS : HALF_ANGLE;
  return offAxis(watcher, target) <= limit;
}

/**
 * Whether the player has a thing near the middle of the screen.
 *
 * No range limit: a corridor is long, and something at the end of it is being
 * looked at just as much as something at arm's length.
 */
export function isFacing(watcher: Watcher, target: Point3, wasFacing: boolean): boolean {
  const limit = wasFacing ? DIRECT_ANGLE + HYSTERESIS : DIRECT_ANGLE;
  return offAxis(watcher, target) <= limit;
}

/** Tracks one thing across frames, and says when the player has looked away. */
export interface Watch {
  watched: boolean;
  /** Seconds the current state has held, so a glance does not count. */
  held: number;
}

export const createWatch = (): Watch => ({ watched: false, held: 0 });

/** How long the player must look away before anything is allowed to change. */
export const LOOK_AWAY_TIME = 0.6;

/**
 * Advances a watch and reports the moment it becomes safe to change.
 *
 * True only on the frame the look-away has lasted long enough, so a caller can
 * act once per turn of the head rather than continuously while the player
 * stands facing a wall.
 */
export function stepWatch(
  watch: Watch,
  watcher: Watcher,
  target: Point3,
  delta: number,
): boolean {
  const watched = isWatched(watcher, target, watch.watched);
  if (watched !== watch.watched) {
    watch.watched = watched;
    watch.held = 0;
    return false;
  }

  const before = watch.held;
  watch.held += delta;
  // The instant the look-away is old enough, and only that instant.
  return !watched && before < LOOK_AWAY_TIME && watch.held >= LOOK_AWAY_TIME;
}
