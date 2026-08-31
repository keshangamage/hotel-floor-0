import { ROOM_DEPTH, ROOM_PITCH, ROOM_WIDTH } from "../data/dimensions";
import { ELEVATOR } from "../data/elevator";
import { applyAnomaly, chooseAnomaly, ENDING_FLOOR, REFERENCE_FLOOR } from "../systems/anomaly";
import { createRandom } from "../systems/random";
import type { FloorSpec, RoomSpec } from "../types";

/** Rooms per side. Eight rooms is a believable hotel floor. */
const ROOMS_PER_SIDE = 4;

/** Empty corridor beyond the last room. */
const TAIL = 2.3;

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
  if (floorNumber === ENDING_FLOOR) return groundFloor(seed);

  // Nothing about the baseline is random any more. It is the same hotel on
  // every floor, and the anomaly is the only thing that varies.
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
  const tail = TAIL;
  const corridorFrom = lastDoor - ROOM_WIDTH / 2 - tail;

  // Odd rooms on the -X wall, even on +X, numbered from the elevator inward.
  const rooms: RoomSpec[] = [];
  for (let i = 0; i < ROOMS_PER_SIDE; i += 1) {
    rooms.push({
      number: floorNumber * 100 + (i * 2 + 1),
      side: -1,
      doorZ: leftDoors[i]!,
      width: ROOM_WIDTH,
      depth: ROOM_DEPTH,
      door: "locked",
      lit: false,
    });
    rooms.push({
      number: floorNumber * 100 + (i * 2 + 2),
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
  // in them worth walking into.
  const guestRoom = rooms.find((r) => r.number === floorNumber * 100 + 7);
  const openIndex = guestRoom ? rooms.indexOf(guestRoom) : -1;
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
    spawnRoom: normal ? floorNumber * 100 + 7 : null,
    anomaly: null,
  };

  return applyAnomaly(base, chooseAnomaly(floorNumber, seed));
}
