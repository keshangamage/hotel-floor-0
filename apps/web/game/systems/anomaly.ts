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
  | "notice-changed"
  | "furniture-moved"
  | "bedside-dark"
  | "painting-gone"
  | "painting-changed"
  | "display-wrong"
  | "sign-gone"
  | "knocking"
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

/** The bottom. Reaching it ends the run, so it is never judged either. */
export const ENDING_FLOOR = 0;

/** Roughly half the floors are wrong, so neither answer is ever the safe one. */
export const ANOMALY_CHANCE = 0.5;

/**
 * How hard each kind is to catch, from 1 for something you cannot miss to 3
 * for something you have to already know to look for.
 *
 * The descent draws from the easy end first and opens up as it goes. A player
 * on their first floor has nothing to compare against yet, so handing them a
 * room gone quiet is not difficulty, it is a coin toss. By the time the floors
 * are subtle they have walked the same corridor three times.
 */
const SUBTLETY: Record<AnomalyKind, 1 | 2 | 3> = {
  // Cannot be walked past.
  "door-open": 1,
  "door-shut": 1,
  "corridor-long": 1,
  "corridor-short": 1,
  "lamp-out": 1,
  "room-lit": 1,
  "flicker": 1,
  "painting-gone": 1,
  "sign-gone": 1,
  // Needs a second look, or a memory of what was there.
  "misnumbered": 2,
  "twinned": 2,
  "door-moved": 2,
  "painting-changed": 2,
  "furniture-moved": 2,
  "bedside-dark": 2,
  "display-wrong": 2,
  "knocking": 2,
  // Needs the player to already know the hotel.
  "following": 3,
  "notice-changed": 3,
  "silence": 3,
};

/** The hardest kind a floor may use, by how far down it is. */
function hardestAt(floorNumber: number): 1 | 2 | 3 {
  const depth = REFERENCE_FLOOR - floorNumber;
  if (depth <= 1) return 1;
  if (depth === 2) return 2;
  return 3;
}

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
  "notice-changed",
  "furniture-moved",
  "bedside-dark",
  "painting-gone",
  "painting-changed",
  "display-wrong",
  "sign-gone",
  "knocking",
  "silence",
  "following",
];

/**
 * Anomalies carried on the floor rather than built into it.
 *
 * These leave the plan alone: nothing is moved or unlocked, so the corridor
 * measures identical and only its sound or its wording is wrong. Whatever
 * draws or plays them reads them off the floor, and the geometry never knows.
 */
export const CARRIED: ReadonlySet<AnomalyKind> = new Set<AnomalyKind>([
  "silence",
  "following",
  "notice-changed",
  // Dressing, which the plan does not describe: the room's and the corridor's.
  "furniture-moved",
  "bedside-dark",
  "painting-gone",
  "painting-changed",
  // The lift's own indicator, which the plan does not describe either.
  "display-wrong",
  // A door plate, which the plan describes as a number rather than a sign.
  "sign-gone",
  // The only one that happens rather than simply being so.
  "knocking",
]);

export const isCarried = (kind: AnomalyKind): boolean => CARRIED.has(kind);

/**
 * Picks what is wrong with a floor, or nothing.
 *
 * Deterministic in the seed and floor number, so the same hotel always goes
 * wrong in the same way, and a saved game can be rebuilt from two numbers.
 */
export function chooseAnomaly(floorNumber: number, seed: string): Anomaly | null {
  // Neither end of the descent is ever judged: one is the reference and the
  // other ends the run on arrival.
  if (floorNumber === REFERENCE_FLOOR || floorNumber === ENDING_FLOOR) return null;

  const random = createRandom(`${seed}:${floorNumber}:anomaly`);
  if (!random.chance(ANOMALY_CHANCE)) return null;

  const allowed = ANOMALY_KINDS.filter((k) => SUBTLETY[k] <= hardestAt(floorNumber));
  const kind = random.pick(allowed);
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
    case "notice-changed": return "the notice in the room does not say what it said";
    case "furniture-moved": return "something in the room has been moved";
    case "bedside-dark": return "the bedside lamp is out";
    case "painting-gone": return "a picture has come off the corridor wall";
    case "painting-changed": return "a picture is not the one that hung there";
    case "display-wrong": return "the lift says it is on a different floor";
    case "sign-gone": return "a door has lost its number";
    case "knocking": return "someone is knocking from inside a locked room";
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
      // Only a room that will actually be given a lamp. A furnished room
      // lights itself from its own fixtures, so choosing one here changed the
      // plan and lit nothing, and the floor read as clean while the game
      // insisted it was not.
      const dark = rooms.map((r, i) => (r.lit || r.furnished ? -1 : i)).filter((i) => i >= 0);
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
    // These change nothing about the plan. They are carried on the floor and
    // read by whatever draws or plays them.
    case "silence":
    case "following":
    case "notice-changed":
    case "furniture-moved":
    case "bedside-dark":
    case "painting-gone":
    case "painting-changed":
    case "display-wrong":
    case "sign-gone":
    case "knocking":
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
