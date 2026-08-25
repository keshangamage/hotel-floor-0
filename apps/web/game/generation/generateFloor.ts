import { ROOM_DEPTH, ROOM_PITCH, ROOM_WIDTH } from "../data/dimensions";
import { ELEVATOR } from "../data/elevator";
import { applyAnomaly, chooseAnomaly, REFERENCE_FLOOR } from "../systems/anomaly";
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
export function generateFloor(floorNumber: number, seed: string = DEFAULT_SEED): FloorSpec {
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

  // The same room stands open on every floor. Furnished only on the reference
  // floor, where it is the player's own.
  const guestRoom = rooms.find((r) => r.number === floorNumber * 100 + 7);
  const openIndex = guestRoom ? rooms.indexOf(guestRoom) : -1;
  if (openIndex >= 0) {
    rooms[openIndex] = {
      ...rooms[openIndex]!,
      door: "unlocked",
      furnished: normal,
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

  // At most two shadow casters: they are by far the biggest lighting cost.
  const casters = createRandom(`${seed}:shadows`).sample(lamps.length, 2);
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
