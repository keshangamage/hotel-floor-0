import { generateFloor, DEFAULT_SEED } from "../game/generation/generateFloor";
import {
  ANOMALY_KINDS, applyAnomaly, chooseAnomaly, isCarried, REFERENCE_FLOOR,
} from "../game/systems/anomaly";
import { buildFloor } from "../game/data/floor";
import { createColliderSet } from "../game/systems/colliders";
import { moveAndCollide } from "../game/systems/collision";
import { PLAYER_HEIGHT } from "../game/data/dimensions";
import type { FloorSpec } from "../game/types";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

// The floors the player actually judges. Floor 5 is the reference they are
// judged against, and floor 0 ends the run on arrival, so neither is one.
const FLOORS = [4, 3, 2, 1];

// The reference floor is what every other floor is judged against, so it can
// never be the odd one out.
check("the reference floor is never anomalous",
  generateFloor(REFERENCE_FLOOR).anomaly === null);
{
  let anomalous = 0;
  for (let i = 0; i < 200; i += 1) {
    if (generateFloor(REFERENCE_FLOOR, `seed-${i}`).anomaly !== null) anomalous += 1;
  }
  check("and not for any seed", anomalous === 0, `${anomalous} of 200 seeds`);
}

// The same hotel must always go wrong the same way, or no save can restore it.
{
  const twice = FLOORS.every((f) => {
    const a = generateFloor(f);
    const b = generateFloor(f);
    return JSON.stringify(a.anomaly) === JSON.stringify(b.anomaly);
  });
  check("the same seed and floor always give the same anomaly", twice);
}

// Neither answer can be the safe one.
{
  let wrong = 0;
  let total = 0;
  for (let i = 0; i < 300; i += 1) {
    for (const f of FLOORS) {
      total += 1;
      if (generateFloor(f, `seed-${i}`).anomaly !== null) wrong += 1;
    }
  }
  const rate = wrong / total;
  check("about half of floors are wrong", rate > 0.4 && rate < 0.6,
    `${(rate * 100).toFixed(0)}% over ${total} floors`);
}

// The whole game rests on this: a floor with nothing wrong must be identical
// to the one the player is comparing it against, or they cannot tell an
// anomaly from ordinary variation. Compared against floor 5 rather than
// against each other, since that is what the player actually remembers.
{
  const strip = (spec: FloorSpec) => JSON.stringify({
    corridorFrom: spec.corridorFrom,
    corridorTo: spec.corridorTo,
    lamps: spec.lamps,
    // Room numbers carry the floor, so compare the part that does not.
    rooms: spec.rooms.map((r) => ({ ...r, number: r.number % 100, furnished: false })),
  });

  let compared = 0;
  const differing: string[] = [];
  for (let i = 0; i < 120; i += 1) {
    const seed = `quiet-${i}`;
    const reference = strip(generateFloor(REFERENCE_FLOOR, seed));
    for (const floor of FLOORS) {
      const spec = generateFloor(floor, seed);
      if (spec.anomaly) continue;
      compared += 1;
      if (strip(spec) !== reference) differing.push(`${seed}@${floor}`);
    }
  }
  check("there are clean floors to compare", compared > 100, `${compared} of ${120 * FLOORS.length}`);
  check("a floor with nothing wrong matches the reference floor exactly",
    differing.length === 0, differing.slice(0, 3).join(", ") || `${compared} compared`);
}

// An anomaly that leaves the floor unchanged is one the player can never spot.
// The kind list comes from the source, so a new kind cannot be added without
// being accounted for here.
{
  const base = generateFloor(REFERENCE_FLOOR);
  const changes = (kind: (typeof ANOMALY_KINDS)[number]) => {
    for (let target = 0; target < 8; target += 1) {
      const after = applyAnomaly(base, { kind, target, description: kind });
      if (JSON.stringify({ ...after, anomaly: null }) !== JSON.stringify(base)) return true;
    }
    return false;
  };

  const structural = ANOMALY_KINDS.filter((k) => !isCarried(k));
  const carried = ANOMALY_KINDS.filter((k) => isCarried(k));
  check("there are kinds of both sorts", structural.length > 0 && carried.length > 0,
    `${structural.length} structural, ${carried.length} carried`);

  const invisible = structural.filter((k) => !changes(k));
  check("every structural anomaly changes the floor plan",
    invisible.length === 0,
    invisible.length ? `invisible: ${invisible.join(", ")}` : `all ${structural.length}`);

  // Carried ones must leave the plan alone, or the corridor measures different
  // and the player can spot them without listening.
  const meddling = carried.filter((k) => changes(k));
  check("a carried anomaly leaves the floor plan alone",
    meddling.length === 0,
    meddling.length ? `changed the plan: ${meddling.join(", ")}` : `all ${carried.length}`);

  // But they must still be carried, or nothing downstream can act on them.
  const dropped = carried.filter((k) =>
    applyAnomaly(base, { kind: k, target: 0, description: k }).anomaly?.kind !== k);
  check("and is still carried on the floor", dropped.length === 0);
}

// The default seed is the first game anyone plays. One seed in thirty leaves
// every floor clean, which is a game with nothing in it.
{
  const specs = FLOORS.map((f) => generateFloor(f, DEFAULT_SEED));
  const wrong = specs.filter((s) => s.anomaly !== null).length;
  check("the default seed has floors that are wrong", wrong > 0, `${wrong} of ${specs.length}`);
  check("and floors that are not", wrong < specs.length, `${specs.length - wrong} clean`);
}

// The car has to stay where it is, or the player steps out somewhere else.
{
  const specs = FLOORS.map((f) => generateFloor(f));
  const anomalous = specs.filter((s) => s.anomaly !== null);
  // Without this the check below passes on an empty list and proves nothing.
  check("there are anomalous floors to check", anomalous.length > 0, `${anomalous.length}`);
  const moved = specs.filter((s) => s.corridorTo !== generateFloor(REFERENCE_FLOOR).corridorTo);
  check("no anomaly moves the elevator", moved.length === 0, `${moved.length} floors moved it`);
}

// A floor still has to be a hotel floor.
{
  // Across many seeds, so every kind of anomaly gets exercised here.
  const specs: FloorSpec[] = [];
  for (let i = 0; i < 200; i += 1) for (const f of FLOORS) specs.push(generateFloor(f, `seed-${i}`));
  const anomalous = specs.filter((s) => s.anomaly !== null);
  check("enough anomalous floors to be worth checking", anomalous.length > 100, `${anomalous.length}`);
  const broken = anomalous.filter((s) =>
    s.rooms.length !== 8 || s.lamps.length === 0 || s.corridorFrom >= s.corridorTo);
  check("an anomalous floor is still a working floor", broken.length === 0, `${broken.length} broken`);
  // A floor with nothing to go into is unsettling rather than broken, and it
  // is exactly what "the door that should be open is locked" means. It must be
  // that anomaly doing it though, and never a side effect of another.
  const sealed = anomalous.filter((s) => !s.rooms.some((r) => r.door === "unlocked"));
  check("some floors are sealed, by the anomaly that seals them", sealed.length > 0,
    `${sealed.length} of ${anomalous.length}`);
  const sealedByOther = sealed.filter((s) => s.anomaly?.kind !== "door-shut").map((s) => s.anomaly?.kind);
  check("no other anomaly seals a floor by accident", sealedByOther.length === 0,
    sealedByOther.length ? [...new Set(sealedByOther)].join(", ") : "only door-shut");

  // The player starts inside a room on the reference floor, so that one door
  // can never be the locked one.
  const home = generateFloor(REFERENCE_FLOOR);
  const own = home.rooms.find((r) => r.number === home.spawnRoom);
  check("the player's own room is never locked", own?.door === "unlocked",
    `room ${home.spawnRoom} is ${own?.door}`);
}

// chooseAnomaly and the generator must agree, or the debug overlay lies.
{
  const mismatched = FLOORS.filter((f) => {
    const picked = chooseAnomaly(f, DEFAULT_SEED);
    return JSON.stringify(picked) !== JSON.stringify(generateFloor(f).anomaly);
  });
  check("the chosen anomaly is the one the floor carries", mismatched.length === 0);
}

// Two of these move walls: one shortens the corridor, one shifts a doorway.
// A wrong number there closes the corridor off or seals a room, so every
// anomalous floor is walked end to end rather than only inspected.
{
  const stuck: string[] = [];
  const missingLamp: string[] = [];
  for (let i = 0; i < 120; i += 1) {
    for (const floor of FLOORS) {
      const spec = generateFloor(floor, `walk-${i}`);
      if (!spec.anomaly) continue;
      const layout = buildFloor(spec);
      const colliders = createColliderSet(layout.boxes).list;

      // From the lift, along the corridor, to the far end.
      const at = { x: 0, y: 0, z: spec.corridorTo - 1 };
      const wanted = at.z - (spec.corridorFrom + 0.8);
      for (let step = 0; step < 900; step += 1) {
        moveAndCollide(at, { x: 0, y: -0.06, z: -0.05 }, PLAYER_HEIGHT, colliders);
      }
      const travelled = (spec.corridorTo - 1) - at.z;
      if (travelled < wanted - 0.6) {
        stuck.push(`${spec.anomaly.kind}@${floor} got ${travelled.toFixed(1)}/${wanted.toFixed(1)}m`);
      }
      // A flickering fixture that never reaches the layout is invisible.
      if (spec.anomaly.kind === "flicker" && !layout.lamps.some((l) => l.flicker)) {
        missingLamp.push(`floor ${floor}`);
      }
    }
  }
  check("every anomalous corridor can still be walked end to end",
    stuck.length === 0, stuck.slice(0, 3).join("; ") || "all walkable");
  check("a flickering fixture reaches the layout", missingLamp.length === 0,
    missingLamp.slice(0, 3).join(", ") || "wired through");
}

// The notice is the only place the rules are written down, so a floor that
// rewrites it is the sharpest anomaly there is. It has to actually differ, and
// still read as a notice rather than as a glitch.
{
  const clean = buildFloor(generateFloor(REFERENCE_FLOOR));
  const altered = buildFloor(
    applyAnomaly(generateFloor(REFERENCE_FLOOR),
      { kind: "notice-changed", target: 0, description: "notice" }));

  const before = clean.notes[0];
  const after = altered.notes[0];
  check("both floors have a notice", before !== undefined && after !== undefined);

  if (before && after) {
    check("the altered notice reads differently",
      before.lines.join("|") !== after.lines.join("|"));
    // Same title and same length, or it is obviously a different piece of
    // paper rather than the same one saying something else.
    check("but it is still the same notice",
      before.title === after.title && before.lines.length === after.lines.length,
      `${after.lines.length} lines`);
    const text = after.lines.join(" ").toLowerCase();
    check("and still gives an instruction either way",
      text.includes("up") && text.includes("down"), text.slice(0, 50) + "...");
    // The point is that it says the opposite, not that it says nonsense.
    const flipped = before.lines.some((line, i) => line !== after.lines[i]);
    check("the instructions are what changed", flipped);
  }

  // It must not touch the plan, or it could be spotted without reading.
  check("the floor plan is untouched",
    JSON.stringify(clean.boxes) === JSON.stringify(altered.boxes),
    `${clean.boxes.length} boxes`);
}

// The room carries anomalies now, and two of them touch things the player has
// to walk around or look at.
{
  const withKind = (kind: Parameters<typeof isCarried>[0]) =>
    buildFloor(applyAnomaly(generateFloor(REFERENCE_FLOOR),
      { kind, target: 0, description: kind }));

  const clean = buildFloor(generateFloor(REFERENCE_FLOOR));
  const moved = withKind("furniture-moved");
  const dark = withKind("bedside-dark");

  // A chair left in the floor must not wall the player into the doorway.
  {
    const colliders = createColliderSet(moved.boxes).list;
    const at = { x: clean.spawn[0], y: 0, z: clean.spawn[2] };
    const startX = at.x;
    for (let step = 0; step < 700; step += 1) {
      moveAndCollide(at, { x: Math.sign(startX) * 0.05, y: -0.06, z: 0 }, PLAYER_HEIGHT, colliders);
    }
    check("a moved chair still leaves the room walkable",
      Math.abs(at.x - startX) > 2.2, `walked ${Math.abs(at.x - startX).toFixed(1)}m into the room`);
  }

  const chairOf = (l: typeof clean) => l.props.find((prop) => prop.id === "chair");
  check("the chair actually moved",
    JSON.stringify(chairOf(moved)?.position) !== JSON.stringify(chairOf(clean)?.position),
    `${JSON.stringify(chairOf(moved)?.position)}`);

  // Out, but still there. Removing it would read as a missing lamp.
  const bedsideOf = (l: typeof clean) => l.lamps.find((lamp) => lamp.id?.endsWith("-bedside"));
  check("the bedside lamp goes out", bedsideOf(dark)?.lit === false);
  check("but the lamp is still on the nightstand",
    bedsideOf(dark) !== undefined && bedsideOf(dark)?.fixture === "table");
  check("and is lit on a clean floor", bedsideOf(clean)?.lit !== false);
}

// Switching a light off used to return null for the whole fixture, so the lamp
// vanished off the nightstand instead of going dark.
{
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(
    "apps/web/components/lighting/HotelLighting.tsx", "utf8");
  check("a switched off lamp keeps its fixture",
    !/lightsOff\[spec\.id\]\s*\?\s*null/.test(source));
  check("and the shade stops glowing with it", /TableLamp[^>]*lit=\{lit\}/.test(source));
}

// Pictures hang in every corridor on every run, so they are worth getting
// exactly right: one fewer, or one swapped, and nothing else.
{
  const withKind = (kind: Parameters<typeof isCarried>[0]) =>
    buildFloor(applyAnomaly(generateFloor(REFERENCE_FLOOR),
      { kind, target: 1, description: kind }));

  const clean = buildFloor(generateFloor(REFERENCE_FLOOR));
  const gone = withKind("painting-gone");
  const swapped = withKind("painting-changed");

  check("a corridor hangs pictures to begin with", clean.paintings.length >= 2,
    `${clean.paintings.length}`);
  check("one comes off the wall", gone.paintings.length === clean.paintings.length - 1,
    `${clean.paintings.length} -> ${gone.paintings.length}`);
  // The rest must not shuffle along, or every picture reads as moved.
  const survivors = gone.paintings.map((p) => p.id);
  const stayed = clean.paintings.filter((p) => survivors.includes(p.id))
    .every((p) => {
      const after = gone.paintings.find((q) => q.id === p.id);
      return JSON.stringify(after?.position) === JSON.stringify(p.position);
    });
  check("and the others stay where they were", stayed);

  check("swapping keeps the same number", swapped.paintings.length === clean.paintings.length);
  const differing = swapped.paintings.filter((p, i) => p.art !== clean.paintings[i]?.art);
  check("exactly one picture changes", differing.length === 1, `${differing.length} changed`);
  // Same frame in the same place, a different picture inside it.
  const before = clean.paintings.find((p) => p.id === differing[0]?.id);
  check("the frame does not move",
    JSON.stringify(before?.position) === JSON.stringify(differing[0]?.position));
  // Three artworks, indexed modulo, so a shift has to land on a real one.
  check("and it really is a different picture",
    ((differing[0]?.art ?? 0) % 3) !== ((before?.art ?? 0) % 3),
    `art ${before?.art} -> ${differing[0]?.art}`);
}

// The lift's indicator is the last thing the player looks at before deciding,
// so a floor that lies about where it is lands at exactly the wrong moment.
{
  const { readFileSync } = await import("node:fs");
  const read = (f: string) => readFileSync(`apps/web/${f}`, "utf8");

  const canvas = read("components/game/GameCanvas.tsx");
  check("the lift is told what is wrong with the floor",
    /<Elevator anomaly=\{spec\.anomaly\}/.test(canvas));

  const lift = read("components/environment/Elevator.tsx");
  check("it works out for itself when to lie",
    /displayWrong = anomaly\?\.kind === "display-wrong"/.test(lift));
  check("and the indicator reads out by one",
    /displayWrong \? readout \+ 1 : readout/.test(lift));
  // The description travels with the call, so a lost run can say what it was.
  check("and hands on what the floor was when judging",
    /recordCall\(verdict, anomaly\?\.description \?\? null\)/.test(lift));

  // The doors still carry the true floor in their numbers, which is the only
  // way the player can catch it.
  const spec = applyAnomaly(generateFloor(4),
    { kind: "display-wrong", target: 0, description: "display" });
  const numbers = spec.rooms.map((r) => Math.floor(r.number / 100));
  check("the room numbers still say the real floor",
    numbers.every((n) => n === 4), [...new Set(numbers)].join(", "));
}

console.log("\nfloors this seed:");
for (const f of [REFERENCE_FLOOR, ...FLOORS]) {
  const spec = generateFloor(f);
  console.log(`  floor ${f}: ${spec.anomaly ? spec.anomaly.description : "nothing wrong"}`);
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
