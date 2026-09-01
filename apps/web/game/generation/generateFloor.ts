import { ROOM_DEPTH, ROOM_PITCH, ROOM_WIDTH } from "../data/dimensions";
import { ELEVATOR } from "../data/elevator";
import { G_FLOOR } from "../systems/elevator";
import { applyAnomaly, chooseAnomaly, ENDING_FLOOR, REFERENCE_FLOOR } from "../systems/anomaly";
import { createRandom } from "../systems/random";
import type { FloorSpec, RoomSpec } from "../types";

/** Rooms per side. Eight rooms is a believable hotel floor. */
const ROOMS_PER_SIDE = 4;

/**
 * Empty corridor beyond the last room.
 *
 * Drawn from the seed, so one hotel's corridor runs longer than another's.
 * Safe to vary because it is drawn once per hotel rather than per floor: the
 * comparison only requires that the floors of a single run agree with each
 * other.
 */
const TAIL_MIN = 1.8;
const TAIL_MAX = 5.4;

/**
 * Chosen, not arbitrary: with half of floors anomalous, roughly one seed in
 * thirty leaves every floor clean, and a first game with nothing to find is a
 * broken one. This seed is checked to give a mix.
 */
export const DEFAULT_SEED = "night-porter";

/**
 * Builds one floor's plan. The same floor number and seed always produce the
 * same plan, which is what the anomalies and the save system rely on.
 *
 * Every floor shares one baseline, drawn from the seed alone and not the floor
 * number. That is deliberate: the game asks the player whether anything has
 * changed since the last floor, and they can only answer if the floors are
 * otherwise identical. Anything that differs between floors is an anomaly, put
 * there on purpose and one at a time.
 */
/**
 * Floor zero.
 *
 * The player never judges this one, because reaching it is the end of the run.
 * So it is not a hotel floor with something wrong with it. It is what the
 * hotel was keeping underneath, and it is built to say so: a corridor twice
 * the length of any other, no doors along it, no numbers, and almost nothing
 * lit. There is nothing here to compare, which is the point.
 */
function groundFloor(seed: string): FloorSpec {
  const to = ELEVATOR.frontZ;
  const FIXTURES = 9;
  const lamps = [];
  for (let i = 0; i < FIXTURES; i += 1) {
    lamps.push({
      z: to - 1 - i * ROOM_PITCH,
      castShadow: false,
      // Every fourth, so the corridor is a chain of pools with dark between.
      lit: i % 4 === 0,
    });
  }

  return {
    floorNumber: ENDING_FLOOR,
    seed,
    corridorFrom: to - 1 - (FIXTURES - 1) * ROOM_PITCH - 3.2,
    corridorTo: to,
    // No rooms at all, so the walls have no openings and the corridor has
    // nothing along it.
    rooms: [],
    lamps,
    spawnRoom: null,
    anomaly: null,
  };
}

export function generateFloor(floorNumber: number, seed: string = DEFAULT_SEED): FloorSpec {
  // Floor zero alone is the empty one: a long dark corridor with nothing off
  // it. Below that the hotel starts again, which is worse than nothing being
  // there, and the pages at the end of each carry the player further down.
  if (floorNumber === ENDING_FLOOR) return groundFloor(seed);

  // G is the fifth floor. Nine floors under the ground the doors open on the
  // corridor the player started in, unchanged and with nothing wrong with it,
  // which is the only answer the game gives.
  if (floorNumber === G_FLOOR) return generateFloor(REFERENCE_FLOOR, seed);

  // One draw per hotel, not per floor. Every floor of a run shares this, so
  // the player still has a fixed thing to compare against, but two runs are
  // two different buildings rather than the same one with different faults.
  const hotel = createRandom(`${seed}:hotel`);
  const normal = floorNumber === REFERENCE_FLOOR;

  // Doors are placed relative to the elevator, so the lobby is identical on
  // every floor and only the far end of the corridor moves.
  const to = ELEVATOR.frontZ;
  const leftDoors: number[] = [];
  const rightDoors: number[] = [];
  for (let i = 0; i < ROOMS_PER_SIDE; i += 1) {
    leftDoors.push(to - ROOM_PITCH * (i + 1));
    rightDoors.push(to - ROOM_PITCH * i - ROOM_PITCH / 2);
  }

  const lastDoor = Math.min(...leftDoors, ...rightDoors);
  const tail = hotel.float(TAIL_MIN, TAIL_MAX);
  const corridorFrom = lastDoor - ROOM_WIDTH / 2 - tail;

  /**
   * Below the ground floor the doors carry the numbers of the player's own.
   *
   * A floor of rooms numbered -99 reads as arithmetic that has gone wrong. A
   * floor of rooms numbered 501 to 508, on a lift that says it is somewhere
   * under the building, reads as the hotel repeating itself.
   */
  const numbered = floorNumber < 0 ? REFERENCE_FLOOR : floorNumber;

  // Odd rooms on the -X wall, even on +X, numbered from the elevator inward.
  const rooms: RoomSpec[] = [];
  for (let i = 0; i < ROOMS_PER_SIDE; i += 1) {
    rooms.push({
      number: numbered * 100 + (i * 2 + 1),
      side: -1,
      doorZ: leftDoors[i]!,
      width: ROOM_WIDTH,
      depth: ROOM_DEPTH,
      door: "locked",
      lit: false,
    });
    rooms.push({
      number: numbered * 100 + (i * 2 + 2),
      side: 1,
      doorZ: rightDoors[i]!,
      width: ROOM_WIDTH,
      depth: ROOM_DEPTH,
      door: "locked",
      lit: false,
    });
  }

  // The same room stands open on every floor, and furnished on every floor.
  // An empty room is nothing to compare, so five of the six floors had nothing
  // in them worth walking into. Which room it is comes from the hotel, so a
  // player cannot arrive already knowing where to go.
  // int is inclusive of its upper bound, so this is the last index, not the count.
  const openIndex = hotel.int(0, rooms.length - 1);
  const guestRoom = rooms[openIndex];
  if (openIndex >= 0) {
    rooms[openIndex] = {
      ...rooms[openIndex]!,
      door: "unlocked",
      furnished: true,
      lit: false,
    };
  }

  // Fixtures march back from the elevator. The 1m offset matters: doors
  // alternate every 2m, so lamps on the pitch sit directly over one side and
  // leave the other outside their cone. Offsetting puts every door 1m from a
  // lamp, and still leaves one over the lobby.
  const lamps: { z: number; castShadow: boolean; lit: boolean }[] = [];
  for (let z = to - 1; z >= corridorFrom; z -= ROOM_PITCH) {
    lamps.push({ z, castShadow: false, lit: true });
  }

  // One shadow caster in the corridor. Each one is a full extra pass over the
  // scene, and the furnished room adds a second of its own, with the player's
  // torch making a third whenever it is on. Occlusion covers the contact
  // darkening a second corridor caster used to be carrying.
  const casters = createRandom(`${seed}:shadows`).sample(lamps.length, 1);
  // Every fixture works. The lamps are spaced so that each door falls inside a
  // cone, and killing one at random strands a door in the dark, so a dead
  // fixture is something that has gone wrong rather than the normal state.
  const dead = new Set<number>();

  const withState = lamps.map((lamp, index) => ({
    ...lamp,
    castShadow: casters.includes(index),
    lit: !dead.has(index),
  }));

  const base: FloorSpec = {
    floorNumber,
    seed,
    corridorFrom,
    corridorTo: to,
    rooms,
    lamps: withState,
    spawnRoom: normal && guestRoom ? guestRoom.number : null,
    anomaly: null,
  };

  return applyAnomaly(base, chooseAnomaly(floorNumber, seed));
}
