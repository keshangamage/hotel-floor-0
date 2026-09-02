// Hotel metrics in metres. Movement speed, eye height and fog are all tuned
// against these, so changing one changes how the whole game reads.

/** Clear width of a corridor, wall face to wall face. */
export const CORRIDOR_WIDTH = 2.0;
export const CORRIDOR_HALF_WIDTH = CORRIDOR_WIDTH / 2;

export const CEILING_HEIGHT = 2.6;
export const WALL_THICKNESS = 0.15;

export const DOOR_WIDTH = 0.9;
export const DOOR_HEIGHT = 2.05;
/** How far a doorway sits back into the wall, forming the alcove. */
export const DOOR_RECESS = 0.12;

/** Distance between adjacent door centres on the same side. */
export const ROOM_PITCH = 4.0;

export const ROOM_WIDTH = 3.4;
export const ROOM_DEPTH = 4.5;

/** Skirting board along the base of each wall. Decorative only. */
export const TRIM_HEIGHT = 0.12;
export const TRIM_DEPTH = 0.03;

/** Window in a room's exterior wall. */
export const WINDOW_ACROSS = 0.65;
/** The window unit's frame reaches below the glazed opening. Set high on the
 * wall, leaving a header below the ceiling. */
export const WINDOW_FRAME_BASE = 1.3;
/** Trims the window unit down from its authored size. */
export const WINDOW_SCALE = 0.85;
// The opening is measured off the frame, so one factor moves both and the
// frame cannot stop covering the wall edges.
export const WINDOW_WIDTH = 1.66 * WINDOW_SCALE;
export const WINDOW_SILL = WINDOW_FRAME_BASE + 0.24 * WINDOW_SCALE;
export const WINDOW_TOP = WINDOW_FRAME_BASE + 0.97 * WINDOW_SCALE;

/** Floor and ceiling slabs. Floor top sits at y = 0. */
export const SLAB_THICKNESS = 0.1;

// Player

/** Horizontal half-extent of the player's collision box. */
export const PLAYER_RADIUS = 0.3;
export const PLAYER_HEIGHT = 1.75;
export const EYE_HEIGHT = 1.62;
export const CROUCH_EYE_HEIGHT = 1.05;
/** Collision height while crouched. Lower than standing so low gaps are passable. */
export const CROUCH_HEIGHT = 1.2;

/**
 * The stairwell off the lift lobby.
 *
 * Every room notice says the stairs are not in service and asks guests to use
 * the lift. Until now that was a line about something the player had never
 * been shown. It sits between the last room and the lift shaft, which is the
 * only clear stretch of wall on the floor.
 */
export const STAIR_WIDTH = 1.5;
export const STAIR_DEPTH = 3.4;
/** From the lift wall to the middle of the opening. */
export const STAIR_INSET = 1.15;

/**
 * A flight the player can see and never climb.
 *
 * Real proportions, because they are what the eye checks without being asked:
 * twelve risers of 173mm against a 280mm going is an ordinary stair, and
 * anything steeper reads as a ladder or a prop.
 */
export const STEP_COUNT = 12;
export const STEP_RUN = 0.28;
export const STEP_RISE = 0.1733;
export const TREAD_THICKNESS = 0.045;
export const RISER_THICKNESS = 0.032;
/** How far the tread stands proud of the riser under it. */
export const NOSING = 0.028;

/** Ceiling over the lower half only, so the flight climbs out through it. */
export const STAIR_SOFFIT = 2.7;
/** Handrail: height above the pitch line, and the size of its section. */
export const RAIL_HEIGHT = 0.9;
export const RAIL_SECTION = 0.055;

/** Boards across the opening, by the height of their lower edge. */
export const BOARD_HEIGHTS = [0.34, 0.94, 1.54] as const;
export const BOARD_DEPTH = 0.055;
export const BOARD_HEIGHT = 0.15;
