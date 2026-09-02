/**
 * Frame timing.
 *
 * The one number in this project nobody has ever had. Every other budget here
 * is checked by a test that can run offline: triangles, draw calls, download
 * size, lights per floor, shadow casters. None of them is the frame rate, and
 * the frame rate is the only one that decides whether the game is playable.
 *
 * Pure, so the averaging can be tested without a renderer.
 */

/** Seconds per published sample. Short enough to react, long enough to settle. */
export const WINDOW = 0.5;

export interface PerfState {
  /** Accumulating, within the current window. */
  frames: number;
  elapsed: number;
  slowest: number;
  /** Published at the end of each window. */
  fps: number;
  /** The longest single frame in that window, in milliseconds. */
  worst: number;
}

export const createPerf = (): PerfState => ({
  frames: 0,
  elapsed: 0,
  slowest: 0,
  fps: 0,
  worst: 0,
});

/**
 * Folds one frame in, and returns true on the frame a new sample is ready.
 *
 * The worst frame is published alongside the average because an average of 60
 * hides a run that hitches once a second, and a hitch is the thing a player
 * actually notices.
 */
export function samplePerf(state: PerfState, delta: number): boolean {
  state.frames += 1;
  state.elapsed += delta;
  state.slowest = Math.max(state.slowest, delta * 1000);

  if (state.elapsed < WINDOW) return false;

  state.fps = state.frames / state.elapsed;
  state.worst = state.slowest;
  state.frames = 0;
  state.elapsed = 0;
  state.slowest = 0;
  return true;
}

/**
 * What the probe last saw, read by the overlay outside the canvas.
 *
 * A module-level object rather than store state, the same way the player's
 * motion is: pushing sixty updates a second through the store to draw a
 * number would cost more than the number is worth.
 */
export const perf = {
  fps: 0,
  worst: 0,
  calls: 0,
  triangles: 0,
};
