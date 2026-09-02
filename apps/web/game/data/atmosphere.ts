/** Fog colour doubles as the clear colour so geometry dissolves into the background. */
export const FOG_COLOR = "#07070a";

/** Tuned so the corridor fades well inside the camera's 60m far plane. */
export const FOG_DENSITY = 0.055;

/** Warm tungsten, dimmed. Anything more saturated reads as cartoonish when lit. */
export const LAMP_COLOR = "#ffcf9e";

/** Just enough fill that shadowed areas are not pure black. Low on purpose:
 *  fill lifts the shadows rather than the lit pools, so raising it flattens the
 *  corridor before it brightens it. */
export const AMBIENT_INTENSITY = 0.09;
export const HEMISPHERE_INTENSITY = 0.13;

/**
 * Emergency lighting: the fitting that comes on when the mains do not.
 *
 * Cold and green because that is what a battery pack with a fluorescent tube
 * in it actually looks like, and because it is the one colour the hotel's warm
 * tungsten never produces. A corridor lit by these is unmistakably a corridor
 * something has happened to.
 */
export const EMERGENCY_COLOR = "#8fd6b4";
/** Dim on purpose. It is meant to get people out, not to light a hotel. */
export const EMERGENCY_INTENSITY = 5;
