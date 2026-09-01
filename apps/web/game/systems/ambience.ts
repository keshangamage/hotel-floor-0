import type { Random } from "./random";

/**
 * When the building makes a noise on its own.
 *
 * Kept apart from the synthesis so the timing can be tested: the whole value of
 * an occasional sound is that it is occasional, and something that fires twice
 * in five seconds is a machine rather than a hotel.
 */

/** Seconds between structural creaks on the hotel's own floors. */
const CREAK_MIN = 17;
const CREAK_MAX = 41;

/** Seconds between whispers. Only ever heard under the hotel. */
const WHISPER_MIN = 24;
const WHISPER_MAX = 58;

/**
 * How much closer together it all comes at the bottom.
 *
 * The floors under the hotel are not louder, they are busier, which is the
 * difference between a place that is frightening and a place that is noisy.
 */
const DEEPEST = 3;
const CROWDING = 0.45;

export interface Ambience {
  creakIn: number;
  whisperIn: number;
}

export interface Heard {
  readonly creak: boolean;
  readonly whisper: boolean;
}

/** 0 on the hotel's own floors, up to 1 at the bottom of what is under it. */
export function depthOf(floorNumber: number): number {
  if (floorNumber >= 0) return 0;
  return Math.min(1, -floorNumber / DEEPEST);
}

/** Whispering belongs to the descent. Nothing above ground has a voice. */
export const whispers = (floorNumber: number): boolean => floorNumber < 0;

function wait(random: Random, min: number, max: number, depth: number): number {
  return random.float(min, max) * (1 - CROWDING * depth);
}

/**
 * A floor's worth of timers.
 *
 * Both start at a full interval rather than at zero, so stepping out of the
 * lift is quiet. A noise that lands the instant the doors open reads as the
 * doors, and the player learns nothing from it.
 */
export function createAmbience(floorNumber: number, random: Random): Ambience {
  const depth = depthOf(floorNumber);
  return {
    creakIn: wait(random, CREAK_MIN, CREAK_MAX, depth),
    whisperIn: wait(random, WHISPER_MIN, WHISPER_MAX, depth),
  };
}

/** Advances the timers and reports what has come due this frame. */
export function stepAmbience(
  state: Ambience,
  delta: number,
  floorNumber: number,
  random: Random,
): Heard {
  const depth = depthOf(floorNumber);
  let creak = false;
  let whisper = false;

  state.creakIn -= delta;
  if (state.creakIn <= 0) {
    creak = true;
    state.creakIn = wait(random, CREAK_MIN, CREAK_MAX, depth);
  }

  if (whispers(floorNumber)) {
    state.whisperIn -= delta;
    if (state.whisperIn <= 0) {
      whisper = true;
      state.whisperIn = wait(random, WHISPER_MIN, WHISPER_MAX, depth);
    }
  }

  return { creak, whisper };
}
