import { createRandom } from "./random";
import type { FloorSpec, RoomSpec } from "../types";

/**
 * What is wrong with a floor.
 *
 * Every fixture works on a floor with nothing wrong with it, so there is no
 * "a dead lamp is lit": there are none to light.
 *
 * The game is a comparison: the player walks a corridor they have walked
 * before and decides whether anything has changed. That only works if the
 * floors are otherwise identical, so the baseline comes from the seed alone
 * and everything that varies between floors is here, deliberately, one at a
 * time.
 */
export type AnomalyKind =
  | "door-open"
  | "door-shut"
  | "lamp-out"
  | "corridor-long"
  | "misnumbered"
  | "room-lit"
  | "corridor-short"
  | "twinned"
  | "door-moved"
  | "flicker"
  | "silence"
  | "following";

export interface Anomaly {
  readonly kind: AnomalyKind;
  /** Which room or fixture it lands on. */
  readonly target: number;
  /** What the player would see. Used by the tests and the debug overlay. */
  readonly description: string;
}

/** The hotel as it should be. Never anomalous: it is what the rest is judged against. */
export const REFERENCE_FLOOR = 5;

/** Roughly half the floors are wrong, so neither answer is ever the safe one. */
export const ANOMALY_CHANCE = 0.5;

/** Every kind there is. Exported so nothing can enumerate a stale subset. */
export const ANOMALY_KINDS: readonly AnomalyKind[] = [
  "door-open",
  "door-shut",
  "lamp-out",
  "corridor-long",
  "misnumbered",
  "room-lit",
  "corridor-short",
  "twinned",
  "door-moved",
  "flicker",
  "silence",
  "following",
];

/**
 * Anomalies you hear rather than see.
 *
 * These leave the floor plan alone: nothing is moved or unlocked, so the
 * corridor measures identical and only the sound of it is wrong. The audio
 * layer reads them off the floor and the geometry never knows.
 */
export const SENSORY: ReadonlySet<AnomalyKind> = new Set<AnomalyKind>(["silence", "following"]);

export const isSensory = (kind: AnomalyKind): boolean => SENSORY.has(kind);

/**
 * Picks what is wrong with a floor, or nothing.
 *
 * Deterministic in the seed and floor number, so the same hotel always goes
 * wrong in the same way, and a saved game can be rebuilt from two numbers.
 */
export function chooseAnomaly(floorNumber: number, seed: string): Anomaly | null {
  if (floorNumber === REFERENCE_FLOOR) return null;

  const random = createRandom(`${seed}:${floorNumber}:anomaly`);
  if (!random.chance(ANOMALY_CHANCE)) return null;

  const kind = random.pick(ANOMALY_KINDS);
  return { kind, target: random.int(0, 1000), description: describe(kind) };
}

function describe(kind: AnomalyKind): string {
  switch (kind) {
    case "door-open": return "a door that should be locked is standing open";
    case "door-shut": return "the door that should be open is locked";
    case "lamp-out": return "a fixture that should be lit is dead";
    case "corridor-long": return "the corridor runs further than it should";
    case "misnumbered": return "a door carries the wrong number";
    case "room-lit": return "light is coming from a room that should be dark";
    case "corridor-short": return "the corridor stops sooner than it should";
    case "twinned": return "two doors carry the same number";
    case "door-moved": return "a door is not where it was";
    case "flicker": return "a fixture will not hold steady";
    case "silence": return "the floor makes no sound at all";
    case "following": return "something is walking a step behind";
  }
}

/** Rewrites a floor so that one thing about it is wrong. */
export function applyAnomaly(spec: FloorSpec, anomaly: Anomaly | null): FloorSpec {
  if (!anomaly) return spec;

  const rooms = [...spec.rooms];
  const lamps = [...spec.lamps];
  const pickIndex = (length: number) => (length === 0 ? -1 : anomaly.target % length);

  switch (anomaly.kind) {
    case "door-open": {
      const shut = rooms.map((r, i) => (r.door === "locked" ? i : -1)).filter((i) => i >= 0);
      const at = shut[pickIndex(shut.length)];
      if (at !== undefined) rooms[at] = { ...rooms[at]!, door: "unlocked" };
      break;
    }
    case "door-shut": {
      const open = rooms.map((r, i) => (r.door === "unlocked" ? i : -1)).filter((i) => i >= 0);
      const at = open[pickIndex(open.length)];
      if (at !== undefined) rooms[at] = { ...rooms[at]!, door: "locked" };
      break;
    }
    case "room-lit": {
      const dark = rooms.map((r, i) => (r.lit ? -1 : i)).filter((i) => i >= 0);
      const at = dark[pickIndex(dark.length)];
      if (at !== undefined) rooms[at] = { ...rooms[at]!, lit: true };
      break;
    }
    case "twinned": {
      // Copying a neighbour's number reads worse than an invented one: the
      // player checks twice because both look like real doors.
      const at = pickIndex(rooms.length);
      const neighbour = rooms[(at + 2) % rooms.length];
      if (at >= 0 && neighbour) rooms[at] = { ...rooms[at]!, number: neighbour.number };
      break;
    }
    case "door-moved": {
      // Rooms on a side sit 4m apart, so shifting one by 0.7m never reaches
      // its neighbour but does break the rhythm of the corridor.
      const at = pickIndex(rooms.length);
      if (at >= 0) rooms[at] = { ...rooms[at]!, doorZ: rooms[at]!.doorZ + 0.7 };
      break;
    }
    case "flicker": {
      const on = lamps.map((l, i) => (l.lit ? i : -1)).filter((i) => i >= 0);
      const at = on[pickIndex(on.length)];
      if (at !== undefined) lamps[at] = { ...lamps[at]!, flicker: true };
      break;
    }
    case "misnumbered": {
      const at = pickIndex(rooms.length);
      // Off by ten: close enough to read as a real number, wrong enough to
      // notice against the door beside it.
      if (at >= 0) rooms[at] = { ...rooms[at]!, number: rooms[at]!.number + 10 };
      break;
    }
    case "lamp-out": {
      const on = lamps.map((l, i) => (l.lit ? i : -1)).filter((i) => i >= 0);
      const at = on[pickIndex(on.length)];
      if (at !== undefined) lamps[at] = { ...lamps[at]!, lit: false };
      break;
    }
    // Sensory kinds change nothing about the plan. They are carried on the
    // floor and read by the audio layer.
    case "silence":
    case "following":
      return { ...spec, anomaly };

    case "corridor-long":
      // Lengthened at the far end only. The elevator has to stay where it is
      // or the player steps out of it into a different place.
      return { ...spec, corridorFrom: spec.corridorFrom - 3.4, anomaly };

    case "corridor-short":
      // Only into the tail. Any further and the end wall would close over the
      // last doorway, which is a broken floor rather than a wrong one.
      return { ...spec, corridorFrom: spec.corridorFrom + 1.6, anomaly };
  }

  return { ...spec, rooms, lamps, anomaly };
}

/** Whether a floor has anything wrong with it. */
export const isAnomalous = (spec: FloorSpec): boolean => spec.anomaly !== null;

/** The rooms a floor is missing or has gained, for the corridor's door list. */
export function anomalyRoom(spec: FloorSpec): RoomSpec | undefined {
  return spec.rooms.find((r) => r.door === "unlocked");
}
