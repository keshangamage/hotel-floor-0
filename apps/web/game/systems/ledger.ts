import { generateFloor } from "../generation/generateFloor";
import { ENDING_FLOOR, REFERENCE_FLOOR } from "./anomaly";
import { G_FLOOR } from "./elevator";

/**
 * What the notebook adds up to.
 *
 * The anomalies are the largest system in the game, and for a long time the
 * player could only look at them. This is the reckoning: of the floors they
 * walked, which were wrong, and which of those they saw.
 *
 * Pure, and apart from the ending screen that shows it, because arithmetic
 * that decides whether somebody was right about seven floors is worth being
 * able to check.
 */
export interface Tally {
  /** Floors walked that could have been wrong. */
  readonly walked: number;
  /** How many of those actually were. */
  readonly wrong: number;
  /** How many the player wrote down. */
  readonly written: number;
  /** Written down and right. */
  readonly caught: number;
  /** Wrong, walked, and not written down. */
  readonly missed: number;
}

/** The fifth floor is the reference, and neither end of the descent is judged. */
export const isJudged = (floor: number): boolean =>
  floor !== REFERENCE_FLOOR && floor !== ENDING_FLOOR && floor !== G_FLOOR;

export function tally(
  seed: string,
  visited: Readonly<Record<string, true>>,
  marked: Readonly<Record<string, true>>,
): Tally {
  let walked = 0;
  let wrong = 0;
  let written = 0;
  let caught = 0;

  for (const key of Object.keys(visited)) {
    const floor = Number(key);
    if (!Number.isFinite(floor) || !isJudged(floor)) continue;

    walked += 1;
    const faulty = generateFloor(floor, seed).anomaly !== null;
    const noted = marked[key] === true;
    if (faulty) wrong += 1;
    if (noted) written += 1;
    if (faulty && noted) caught += 1;
  }

  return { walked, wrong, written, caught, missed: wrong - caught };
}
