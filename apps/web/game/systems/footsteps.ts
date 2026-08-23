/**
 * Footstep timing.
 *
 * Driven by distance travelled rather than elapsed time, the same way head bob
 * is. Steps then land with the feet at any speed, never drift out of phase, and
 * stop the instant the player does, with no timer to cancel.
 */

export type Gait = "walk" | "sprint" | "crouch";

/** Metres between footfalls. A sprint covers more ground per stride. */
const STRIDE: Record<Gait, number> = {
  walk: 0.78,
  sprint: 1.02,
  crouch: 0.66,
};

export interface StepTracker {
  /** Distance travelled at which the next footfall lands. */
  next: number;
  /** Alternating feet, so consecutive steps are not identical. */
  left: boolean;
}

export const createStepTracker = (): StepTracker => ({ next: STRIDE.walk, left: true });

/**
 * True once per stride. Call every frame with the running distance total.
 *
 * A large jump in `travelled` (a floor change, a respawn) would otherwise fire
 * a burst of steps, so anything beyond one stride resynchronises instead.
 */
export function stepDue(tracker: StepTracker, travelled: number, gait: Gait): boolean {
  const stride = STRIDE[gait];

  if (travelled < tracker.next - stride * 2) {
    tracker.next = travelled + stride;
    return false;
  }
  if (travelled < tracker.next) return false;

  tracker.left = !tracker.left;
  tracker.next = Math.max(travelled, tracker.next) + stride;
  return true;
}

/** How hard the foot lands, as a gain multiplier. */
export function stepWeight(gait: Gait): number {
  if (gait === "sprint") return 1;
  if (gait === "crouch") return 0.35;
  return 0.62;
}
