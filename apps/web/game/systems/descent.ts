import { REFERENCE_FLOOR } from "./anomaly";

/**
 * The rule the game turns on.
 *
 * The player walks a corridor they have walked before and says whether
 * anything has changed. Either answer is right on the right floor, which is
 * what stops the game being a coin toss weighted one way.
 *
 * A verdict rather than a direction, and the distinction matters. Both answers
 * take the lift down a floor when they are right, so calling them up and down
 * described where the player thought they were going rather than where they
 * went, and contradicted the floor number on the way.
 */
export type Call = "unchanged" | "changed";

/** Depth 0 is the reference floor. Reaching this depth is floor 0, and the end. */
export const DEPTH_TO_WIN = REFERENCE_FLOOR;

/** Floors count down as the player gets deeper. */
export const floorAtDepth = (depth: number): number => REFERENCE_FLOOR - depth;

/** True when the call matches what the floor was actually doing. */
export const isCorrect = (anomalous: boolean, call: Call): boolean =>
  (call === "changed") === anomalous;

export interface Verdict {
  readonly correct: boolean;
  /** Depth after the call. A wrong call costs everything. */
  readonly depth: number;
  readonly floor: number;
  readonly won: boolean;
}

/**
 * Judges one call and says where the player ends up.
 *
 * A wrong call goes back to the top. The threat has to be losing the run, or
 * there is no reason to look carefully.
 */
export function judge(depth: number, anomalous: boolean, call: Call): Verdict {
  const correct = isCorrect(anomalous, call);
  const next = correct ? Math.min(depth + 1, DEPTH_TO_WIN) : 0;
  return { correct, depth: next, floor: floorAtDepth(next), won: next >= DEPTH_TO_WIN };
}
