import type { Gait } from "./footsteps";

/**
 * What the player is doing right now, for systems that need it every frame.
 *
 * A module singleton like `input`, not store state: this changes 60 times a
 * second and pushing it through Zustand would re-render the tree every frame.
 * The Player writes it; anything mounted after the Player reads it.
 */
export const motion = {
  /** Running total of ground covered, in metres. Drives step cadence. */
  travelled: 0,
  /** Horizontal speed in metres per second. */
  speed: 0,
  gait: "walk" as Gait,
  grounded: true,
};
