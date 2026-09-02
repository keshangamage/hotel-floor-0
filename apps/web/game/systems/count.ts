/**
 * The count.
 *
 * The pages under the hotel are about a man counting his son down in a lift so
 * that the boy would not be frightened: five, four, three, two, one, and then
 * the word that is not a number. The last page says so in his own hand.
 *
 * That is the instruction. The panel has refused every press since floor zero,
 * and at the end the refusing buttons are the answer: count down on them and
 * the word that is not a number appears under them.
 *
 * Pure, because a puzzle that can be entered wrongly needs to be exactly as
 * forgiving as it claims.
 */
export const COUNT_DOWN = [5, 4, 3, 2, 1] as const;

/**
 * How far the count has got after a press.
 *
 * A wrong number puts it back to nothing, except when the wrong number is the
 * first one: a player who presses five, four, then five again has not failed,
 * they have started over, and telling them otherwise would make them press
 * five twice to recover from a slip.
 */
export function countPress(progress: number, floor: number): number {
  if (floor === COUNT_DOWN[progress]) return progress + 1;
  return floor === COUNT_DOWN[0] ? 1 : 0;
}

/** Whether the whole count has been entered. */
export const counted = (progress: number): boolean => progress >= COUNT_DOWN.length;

/** Whether a button should be lit, given how far the count has got. */
export const lit = (progress: number, floor: number): boolean => {
  const at = COUNT_DOWN.indexOf(floor as (typeof COUNT_DOWN)[number]);
  return at >= 0 && at < progress;
};
