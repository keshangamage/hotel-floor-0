/**
 * Atmosphere constants shared by the renderer and, later, the lighting system.
 *
 * Fog colour doubles as the clear colour so geometry dissolves into the
 * background instead of silhouetting against a different shade.
 */
export const FOG_COLOR = "#07070a";

/** Tuned so the corridor fades well inside the camera's 60m far plane. */
export const FOG_DENSITY = 0.085;
