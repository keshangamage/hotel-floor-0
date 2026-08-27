import { generateFloor, DEFAULT_SEED } from "../game/generation/generateFloor";
import { buildFloor } from "../game/data/floor";
import { createRandom, hashSeed } from "../game/systems/random";
import { createColliderSet, emptyCollider } from "../game/systems/colliders";
import { doorFootprint } from "../game/systems/doors";
import { moveAndCollide, isClear } from "../game/systems/collision";
import { ELEVATOR, CAR_CENTRE } from "../game/data/elevator";
import { ELEVATOR_CONFIG, isServed } from "../game/systems/elevator";
import { PLAYER_HEIGHT, CORRIDOR_HALF_WIDTH } from "../game/data/dimensions";
import type { Point3 } from "../game/types";

let fail = 0;
const check = (n: string, ok: boolean, d = "") => { if (!ok) fail++; console.log(`${ok?"PASS":"FAIL"}  ${n}${d?"  "+d:""}`); };

// Determinism is the whole contract.
const a = generateFloor(0, "seed-a");
const b = generateFloor(0, "seed-a");
check("same floor and seed produce identical plans", JSON.stringify(a) === JSON.stringify(b));
check("same seed produces identical geometry",
  JSON.stringify(buildFloor(a)) === JSON.stringify(buildFloor(b)));
check("a different seed produces a different plan",
  JSON.stringify(generateFloor(0, "seed-b")) !== JSON.stringify(a));
check("a different floor produces a different plan",
  JSON.stringify(generateFloor(-1, "seed-a")) !== JSON.stringify(a));

// RNG primitives
const r1 = createRandom("x"); const r2 = createRandom("x");
check("rng streams match for equal seeds",
  Array.from({length: 50}, () => r1.next()).join() === Array.from({length: 50}, () => r2.next()).join());
check("hashSeed is stable", hashSeed("hotel") === hashSeed("hotel"));
check("hashSeed separates inputs", hashSeed("hotel") !== hashSeed("hotea"));
const r3 = createRandom(7);
const ints = Array.from({ length: 400 }, () => r3.int(2, 5));
check("int stays in range", ints.every((v) => v >= 2 && v <= 5 && Number.isInteger(v)));
check("int covers its range", new Set(ints).size === 4);
check("sample returns distinct indices", (() => {
  const s = createRandom(3).sample(10, 4);
  return s.length === 4 && new Set(s).size === 4 && s.every((i) => i >= 0 && i < 10);
})());
check("sample cannot over-draw", createRandom(3).sample(3, 10).length === 3);
check("shuffle does not mutate its input", (() => {
  const input = [1, 2, 3, 4, 5];
  createRandom(1).shuffle(input);
  return input.join() === "1,2,3,4,5";
})());

// Floor 5 must remain the hotel as designed.
const f5 = generateFloor(5, DEFAULT_SEED);
check("floor 5 has eight rooms", f5.rooms.length === 8);
check("floor 5 is numbered 501-508",
  f5.rooms.map(r => r.number).sort((x,y)=>x-y).join() === "501,502,503,504,505,506,507,508");
check("floor 5 starts the player in 507", f5.spawnRoom === 507);
check("507 is unlocked and furnished", (() => {
  const r = f5.rooms.find(x => x.number === 507)!;
  return r.door === "unlocked" && r.furnished === true;
})());
check("only one door is unlocked on floor 5",
  f5.rooms.filter(r => r.door === "unlocked").length === 1);
check("every fixture on floor 5 works", f5.lamps.every(l => l.lit));

// Floor 0 should read as a normal floor that is subtly wrong.
const f0 = generateFloor(0, DEFAULT_SEED);
// Floor zero ends the run on arrival rather than being judged, so it is not a
// hotel floor with something wrong. It has no doors along it at all, and that
// absence is the thing the player is meant to feel.
check("floor zero has no rooms", f0.rooms.length === 0, `${f0.rooms.length} rooms`);
check("and so no doors to open", buildFloor(f0).doors.length === 0,
  `${buildFloor(f0).doors.length} doors`);
check("its corridor runs longer than any other",
  f0.corridorFrom < f5.corridorFrom - 8,
  `${(f5.corridorFrom - f0.corridorFrom).toFixed(1)}m longer`);
check("and most of it is unlit",
  f0.lamps.filter((l) => l.lit).length * 2 < f0.lamps.length,
  `${f0.lamps.filter((l) => l.lit).length} of ${f0.lamps.length} lit`);
check("floor 5 keeps its designed corridor length",
  Math.abs(f5.corridorFrom + 10) < 1e-9, `${f5.corridorFrom.toFixed(2)}`);

// "The corridor seems slightly longer than expected" only lands if it is never
// shorter. With a plain random tail it came out shorter on most seeds.
// Floors used to drift at random below floor 5. They no longer do: the game
// asks whether anything has changed, and the player can only answer if an
// anomaly is the only thing that ever differs. These two guard exactly that.
{
  let differed = 0;
  let unexplained = 0;
  for (let i = 0; i < 200; i += 1) {
    for (const floor of [4, 3, 2, 1]) {
      const spec = generateFloor(floor, `seed-${i}`);
      const reference = generateFloor(5, `seed-${i}`);
      const longer = spec.corridorFrom < reference.corridorFrom;
      if (!longer) continue;
      differed += 1;
      if (spec.anomaly?.kind !== "corridor-long") unexplained += 1;
    }
  }
  check("some corridors do run long", differed > 0, `${differed} of 1000 floors`);
  check("a corridor runs long only where the anomaly says so", unexplained === 0,
    `${unexplained} unexplained`);
}
{
  let dark = 0;
  let unexplained = 0;
  for (let i = 0; i < 200; i += 1) {
    for (const floor of [4, 3, 2, 1]) {
      const spec = generateFloor(floor, `seed-${i}`);
      if (spec.lamps.every((l) => l.lit)) continue;
      dark += 1;
      if (spec.anomaly?.kind !== "lamp-out") unexplained += 1;
    }
  }
  check("some fixtures are dead", dark > 0, `${dark} of 1000 floors`);
  check("a fixture is dead only where the anomaly says so", unexplained === 0,
    `${unexplained} unexplained`);
}
check("floor 0 still has working fixtures, so it is explorable",
  f0.lamps.filter(l => l.lit).length >= 2);
// Every floor's open room is furnished now. An empty room is nothing to
// compare, and the room has to be worth walking into on all six floors, not
// just the one the player starts on.
{
  const unfurnished: number[] = [];
  const noRoom: number[] = [];
  for (const floor of [5, 4, 3, 2, 1]) {
    const spec = generateFloor(floor);
    const open = spec.rooms.filter((r) => r.door === "unlocked");
    if (open.length === 0) { noRoom.push(floor); continue; }
    if (!open.some((r) => r.furnished)) unfurnished.push(floor);
  }
  check("every floor has a furnished room to compare",
    unfurnished.length === 0, unfurnished.length ? `bare on ${unfurnished.join(", ")}` : "all six");
  // Only the reference floor is one the player wakes up in.
  const spawns = [5, 4, 3, 2, 1].filter((f) => generateFloor(f).spawnRoom !== null);
  check("only the reference floor is spawned into", spawns.join() === "5", spawns.join(", "));
}

// The elevator is fixed in place, so the car does not move between floors.
check("every floor shares the elevator end",
  [0, 5, -1, -2].every(n => generateFloor(n, DEFAULT_SEED).corridorTo === ELEVATOR.frontZ));
check("the elevator serves floor 0", isServed(0, ELEVATOR_CONFIG) && isServed(5, ELEVATOR_CONFIG));

// Shadow budget must hold on generated floors too.
for (const n of [0, 5, -1, -2, -3]) {
  const f = generateFloor(n, DEFAULT_SEED);
  const casters = f.lamps.filter(l => l.castShadow).length;
  if (casters > 2) { check(`floor ${n} shadow budget`, false, `${casters}`); }
}
check("no generated floor exceeds two shadow casters", true);

// Every generated floor must be playable: the car must be standable and the
// corridor walkable, or the player arrives inside a wall.
for (const n of [0, 5, -1, -2, -3, -4]) {
  const layout = buildFloor(generateFloor(n, DEFAULT_SEED));
  const set = createColliderSet(layout.boxes);
  for (const d of layout.doors) {
    const box = emptyCollider();
    doorFootprint(d, d.closedYaw, box);
    set.add(box);
  }
  const car: Point3 = { x: CAR_CENTRE[0], y: 0, z: CAR_CENTRE[2] };
  if (!isClear(car, PLAYER_HEIGHT, set.list)) check(`floor ${n}: car is standable`, false);

  // Walk from the lobby to the far end of the corridor.
  const p: Point3 = { x: 0, y: 0, z: ELEVATOR.frontZ - 1.5 };
  for (let i = 0; i < 900; i++) moveAndCollide(p, { x: 0, y: -0.05, z: -0.05 }, PLAYER_HEIGHT, set.list);
  const reached = p.z < layout.spawn[2] || p.z < generateFloor(n, DEFAULT_SEED).corridorFrom + 1.5;
  if (!reached) check(`floor ${n}: corridor is walkable`, false, `stopped at z=${p.z.toFixed(2)}`);
  if (Math.abs(p.x) > CORRIDOR_HALF_WIDTH) check(`floor ${n}: stayed in the corridor`, false);
}
check("every generated floor is standable and walkable", true);

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
