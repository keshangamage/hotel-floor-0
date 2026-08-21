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
