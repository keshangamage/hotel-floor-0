import { ROOM_DEPTH, ROOM_PITCH, ROOM_WIDTH } from "../data/dimensions";
import { ELEVATOR } from "../data/elevator";
import { createRandom } from "../systems/random";
import type { FloorSpec, RoomSpec } from "../types";

/** Rooms per side. Eight rooms is a believable hotel floor. */
const ROOMS_PER_SIDE = 4;

/**
 * Empty corridor beyond the last room. The normal floor's tail is fixed, and
 * every other floor's is drawn from a range strictly above it, so a corridor
 * below floor 5 always reads as longer than it should be, never shorter.
 */
const TAIL_NORMAL = 2.3;
const TAIL_MIN = 3.2;
const TAIL_MAX = 6.5;

export const DEFAULT_SEED = "hotel-floor-0";

/**
 * Builds one floor's plan. The same floor number and seed always produce the
 * same plan, which is what Milestone 5's anomalies and the save system rely on.
 *
 * Floor 5 is the hotel as it should be, so it is generated without variation.
 * Everything below it drifts.
 */
export function generateFloor(floorNumber: number, seed: string = DEFAULT_SEED): FloorSpec {
  const random = createRandom(`${seed}:${floorNumber}`);
  const normal = floorNumber === 5;

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
  const tail = normal ? TAIL_NORMAL : random.float(TAIL_MIN, TAIL_MAX);
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

  // On the normal floor the player's own room is open and furnished. Elsewhere
  // one door hangs open at random, which is unsettling rather than convenient.
  const guestRoom = normal
    ? rooms.find((r) => r.number === floorNumber * 100 + 7)
    : random.pick(rooms);
  const openIndex = guestRoom ? rooms.indexOf(guestRoom) : -1;
  if (openIndex >= 0) {
    rooms[openIndex] = {
      ...rooms[openIndex]!,
      door: "unlocked",
      furnished: normal,
      lit: !normal && random.chance(0.5),
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
  const casters = createRandom(`${seed}:${floorNumber}:shadows`).sample(lamps.length, 2);
  // Below floor 5 some fixtures are simply dead.
  const deadCount = normal ? 0 : Math.round(lamps.length * random.float(0.15, 0.4));
  const dead = new Set(random.sample(lamps.length, deadCount));

  const withState = lamps.map((lamp, index) => ({
    ...lamp,
    castShadow: casters.includes(index),
    lit: !dead.has(index),
  }));

  return {
    floorNumber,
    seed,
    corridorFrom,
    corridorTo: to,
    rooms,
    lamps: withState,
    spawnRoom: normal ? floorNumber * 100 + 7 : null,
  };
}
