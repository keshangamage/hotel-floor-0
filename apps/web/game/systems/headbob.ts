import { WALK_SPEED } from "./movement";

/** Radians of bob phase per metre walked. Roughly one footfall per 0.9m. */
const PHASE_PER_METRE = Math.PI / 0.9;

const VERTICAL = 0.022;
const LATERAL = 0.014;
const ROLL = 0.0055;

export interface Bob {
  vertical: number;
  lateral: number;
  roll: number;
}

export function createBob(): Bob {
  return { vertical: 0, lateral: 0, roll: 0 };
}

/**
 * Bob is driven by distance travelled, not elapsed time, so it stops dead when
 * the player stops instead of drifting on the spot. Amplitude scales with speed,
 * which also fades it out smoothly rather than freezing mid-step.
 */
export function headBob(distance: number, speed: number, out: Bob): Bob {
  const scale = Math.min(speed / WALK_SPEED, 1.35);
  if (scale <= 0.001) {
    out.vertical = 0;
    out.lateral = 0;
    out.roll = 0;
    return out;
  }

  const phase = distance * PHASE_PER_METRE;
  // Vertical peaks on every footfall, lateral sways once per full stride.
  out.vertical = Math.sin(phase * 2) * VERTICAL * scale;
  out.lateral = Math.sin(phase) * LATERAL * scale;
  out.roll = Math.sin(phase) * ROLL * scale;
  return out;
}
