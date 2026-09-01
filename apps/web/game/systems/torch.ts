/**
 * The torch's cell.
 *
 * Pure, so the arithmetic can be tested apart from the light: a torch that
 * runs out is only fair if the player can see it running out, and the shape of
 * that fade is the whole of the fairness.
 */

/** Seconds of light from a fresh cell. Long enough to cross several floors. */
export const TORCH_SECONDS = 300;

/** Below this it begins to go, which is the warning. */
export const FAILING = 0.22;

export function drain(charge: number, delta: number, on: boolean): number {
  if (!on) return charge;
  return Math.max(0, charge - delta / TORCH_SECONDS);
}

/**
 * How much beam is left, 0 to 1.
 *
 * Full until it starts failing, then down to nothing. A torch that dimmed from
 * the first second would read as a poor light rather than a dying one, and the
 * player would never learn what a dying one looks like.
 */
export function beam(charge: number): number {
  if (charge <= 0) return 0;
  if (charge >= FAILING) return 1;
  return charge / FAILING;
}

/**
 * The beam this instant, including the unsteadiness of a cell going flat.
 *
 * Driven by elapsed time rather than by chance, so it does not stutter
 * differently on every frame, and two waves that never line up so it never
 * settles into a rhythm the player can ignore.
 */
export function waver(charge: number, seconds: number): number {
  const strength = beam(charge);
  if (strength >= 1) return 1;
  const depth = (1 - strength) * 0.6;
  const flutter = Math.sin(seconds * 21.3) * Math.sin(seconds * 7.7);
  return strength * (1 - depth * Math.max(0, flutter));
}
