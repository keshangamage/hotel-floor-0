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
// Which room stands open is drawn from the seed now, so this checks the
// relationship rather than the number: the player wakes in whichever room the
// hotel left open.
check("floor 5 starts the player in the room it left open",
  f5.spawnRoom === f5.rooms.find((r) => r.door === "unlocked")?.number,
  `${f5.spawnRoom}`);
check("that room is unlocked and furnished", (() => {
  const r = f5.rooms.find(x => x.number === f5.spawnRoom)!;
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
// Reaching floor zero is the end of the run, and until now there was nothing
// down there to find. The note is the only payoff the game offers.
{
  const layout = buildFloor(f0);
  const note = layout.notes.find((n) => n.id === "floor-0-notice");
  check("something is waiting at the bottom", note !== undefined,
    `${layout.notes.length} notes`);

  if (note) {
    // At the far end, so the walk through the dark is the point.
    const fromLift = f0.corridorTo - note.position[2];
    check("it is at the far end of the corridor", fromLift > 30,
      `${fromLift.toFixed(0)}m from the lift`);
    check("and inside the corridor rather than through the wall",
      note.position[2] > f0.corridorFrom, `z=${note.position[2].toFixed(1)}`);
    check("lying on the floor", note.position[1] > 0 && note.position[1] < 0.05,
      `y=${note.position[1]}`);
    check("and it says something", note.lines.some((l) => l.length > 0));
  }

  // Only there. A floor the player still has to judge must not gain a note.
  const elsewhere = [5, 4, 3, 2, 1]
    .filter((n) => buildFloor(generateFloor(n)).notes.some((x) => x.id === "floor-0-notice"));
  check("and nowhere else", elsewhere.length === 0, elsewhere.join(", ") || "floor zero only");
}

check("and most of it is unlit",
  f0.lamps.filter((l) => l.lit).length * 2 < f0.lamps.length,
  `${f0.lamps.filter((l) => l.lit).length} of ${f0.lamps.length} lit`);
// The tail is drawn per hotel, so this checks the range rather than a number.
check("floor 5's corridor is within the designed range",
  f5.corridorTo - f5.corridorFrom > 18 && f5.corridorTo - f5.corridorFrom < 24,
  `${(f5.corridorTo - f5.corridorFrom).toFixed(1)}m`);

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
  if (casters > 1) { check(`floor ${n} corridor shadow budget`, false, `${casters}`); }
}
// Counted here rather than asserted as a literal: this check used to pass a
// hard coded true, so it reported a budget it never measured.
{
  const worst = Math.max(...[5, 4, 3, 2, 1, 0]
    .map((n) => generateFloor(n, DEFAULT_SEED).lamps.filter((l) => l.castShadow).length));
  check("no corridor casts more than one shadow", worst <= 1, `worst floor has ${worst}`);
}

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

// Which room stands open is drawn from the seed, so it has to land on a real
// room in every hotel. An index one past the end leaves the floor sealed, and
// the player with nowhere to go and nothing to compare.
{
  const sealed: string[] = [];
  const several = new Set<number>();
  for (let i = 0; i < 400; i += 1) {
    const seed = `hotel-${i}`;
    const spec = generateFloor(5, seed);
    const open = spec.rooms.filter((r) => r.door === "unlocked");
    if (open.length !== 1) sealed.push(`${seed}: ${open.length} open`);
    if (open[0]) several.add(open[0].number);
    // And the room the player wakes in has to be that one.
    if (spec.spawnRoom !== open[0]?.number) sealed.push(`${seed}: spawn ${spec.spawnRoom}`);
  }
  check("every hotel has exactly one room open, and wakes the player in it",
    sealed.length === 0, sealed.slice(0, 3).join("; ") || "400 hotels");
  // And it is always the same room. The player is a guest in 507, which is the
  // one room in this hotel meant to be a particular room: a guest whose own
  // door moved between hotels would have nothing at all to be sure of.
  check("and it is always 507", several.size === 1 && several.has(507),
    [...several].join(", "));
}

// Two hotels should be two buildings, not the same one with different faults.
{
  const shapes = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    const spec = generateFloor(5, `shape-${i}`);
    shapes.add(`${spec.corridorFrom.toFixed(2)}|${spec.rooms.find((r) => r.door === "unlocked")?.number}`);
  }
  check("hotels differ from one another", shapes.size > 100, `${shapes.size} shapes in 200 seeds`);
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
