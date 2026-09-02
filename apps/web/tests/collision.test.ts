import { PLAYER_HEIGHT, PLAYER_RADIUS, CROUCH_HEIGHT } from "../game/data/dimensions";
import {
  collidersFrom, isClear, isGrounded, moveAndCollide, STEP_HEIGHT,
} from "../game/systems/collision";
import type { AABB, BoxSpec, Point3 } from "../game/types";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const box = (
  position: [number, number, number],
  size: [number, number, number],
): BoxSpec => ({ kind: "wall", position, size, collides: true });

const at = (x: number, y: number, z: number): Point3 => ({ x, y, z });
/** One frame's worth of movement, as the player loop would issue it. */
const step = (p: Point3, dx: number, dz: number, colliders: ReturnType<typeof collidersFrom>) =>
  moveAndCollide(p, { x: dx, y: -0.05, z: dz }, PLAYER_HEIGHT, colliders);

const FLOOR = box([0, -0.1, 0], [80, 0.2, 80]);

// Boxes that do not collide are art, and must not stop anybody.
{
  const mixed = collidersFrom([FLOOR, { ...box([0, 1, 0], [1, 1, 1]), collides: false }]);
  check("non-colliding boxes are not colliders", mixed.length === 1, `${mixed.length} of 2`);
}

// The wall thickness in this hotel is 0.15m, and a sprint covers 3.4m/s. A
// frame at 30fps moves 0.11m, but a stutter to 5fps moves 0.68m, which is four
// walls deep. Substepping is the only thing standing between the player and
// the void.
{
  const WALL_THICKNESS = 0.15;
  const wall = box([0, 1.5, 0], [8, 3, WALL_THICKNESS]);
  const colliders = collidersFrom([FLOOR, wall]);
  const through: string[] = [];
  for (const frame of [1 / 60, 1 / 30, 1 / 10, 1 / 5, 0.5]) {
    const p = at(0, 0, -1.5);
    // Straight at it, fast, for as long as a stalled tab might.
    for (let i = 0; i < 40; i += 1) step(p, 0, 3.4 * frame, colliders);
    if (p.z > 0) through.push(`${(1 / frame).toFixed(0)}fps landed at z=${p.z.toFixed(2)}`);
  }
  check("a sprint cannot tunnel through a wall at any frame rate",
    through.length === 0, through.join("; ") || "held at every rate");
}

// Walking into a wall at an angle has to slide along it, not stop dead. This
// is what per-axis resolution buys, and it is the difference between a
// corridor that feels solid and one that feels sticky.
{
  const wall = box([0, 1.5, 2], [40, 3, 0.15]);
  const colliders = collidersFrom([FLOOR, wall]);
  const p = at(0, 0, 0);
  for (let i = 0; i < 200; i += 1) step(p, 0.03, 0.03, colliders);
  check("a wall stops forward motion", p.z < 2, `z=${p.z.toFixed(2)}`);
  check("but the player slides along it", p.x > 2, `slid ${p.x.toFixed(2)}m`);
}

// Head on, nothing sideways should happen.
{
  const colliders = collidersFrom([FLOOR, box([0, 1.5, 2], [40, 3, 0.15])]);
  const p = at(0, 0, 0);
  for (let i = 0; i < 200; i += 1) step(p, 0, 0.05, colliders);
  check("a head on wall does not slide the player sideways",
    Math.abs(p.x) < 1e-6, `x=${p.x.toFixed(4)}`);
}

// A threshold or a rug edge must not stop a walking player.
{
  const ledge = box([0, STEP_HEIGHT / 2, 3], [40, STEP_HEIGHT, 2]);
  const colliders = collidersFrom([FLOOR, ledge]);
  const p = at(0, 0, 0);
  let onTop = 0;
  for (let i = 0; i < 300; i += 1) {
    step(p, 0, 0.04, colliders);
    // Sample while over the ledge: past its far edge the player steps down
    // again, and a height read there would say nothing.
    if (p.z > 2.4 && p.z < 3.6) onTop = Math.max(onTop, p.y);
  }
  check("a step of the allowed height is walked up",
    onTop >= STEP_HEIGHT - 0.01, `stood at y=${onTop.toFixed(2)} on a ${STEP_HEIGHT}m step`);
  check("and the player carries on past it", p.z > 4, `z=${p.z.toFixed(2)}`);
}

// And anything taller is a wall, or the player walks up the furniture.
{
  const tall = box([0, 0.6, 3], [40, 1.2, 2]);
  const colliders = collidersFrom([FLOOR, tall]);
  const p = at(0, 0, 0);
  for (let i = 0; i < 300; i += 1) step(p, 0, 0.04, colliders);
  check("anything taller is not", p.z < 2, `z=${p.z.toFixed(2)}`);
}

// Standing up inside something is how a player ends up in a wall.
{
  const soffit = box([0, CROUCH_HEIGHT + 0.3, 0], [4, 0.4, 4]);
  const colliders = collidersFrom([FLOOR, soffit]);
  check("a low ceiling refuses standing", !isClear(at(0, 0, 0), PLAYER_HEIGHT, colliders));
  check("but allows crouching", isClear(at(0, 0, 0), CROUCH_HEIGHT, colliders));
  check("and open floor allows either",
    isClear(at(20, 0, 20), PLAYER_HEIGHT, collidersFrom([FLOOR])));
}

// Gravity needs to know when to stop.
{
  const colliders = collidersFrom([FLOOR]);
  check("standing on the floor is grounded", isGrounded(at(0, 0, 0), colliders));
  check("a metre up is not", !isGrounded(at(0, 1, 0), colliders));

  const p = at(0, 3, 0);
  for (let i = 0; i < 240; i += 1) moveAndCollide(p, { x: 0, y: -0.08, z: 0 }, PLAYER_HEIGHT, colliders);
  check("a fall lands on the floor rather than through it",
    Math.abs(p.y) < 0.01, `y=${p.y.toFixed(3)}`);
}

// A corner is two walls at once, and resolving one must not push the player
// into the other.
{
  const colliders = collidersFrom([
    FLOOR,
    box([0, 1.5, 2], [40, 3, 0.15]),
    box([2, 1.5, 0], [0.15, 3, 40]),
  ]);
  const p = at(0, 0, 0);
  for (let i = 0; i < 400; i += 1) step(p, 0.05, 0.05, colliders);
  const inside = p.x < 2 - PLAYER_RADIUS + 0.02 && p.z < 2 - PLAYER_RADIUS + 0.02;
  check("a corner holds the player on both sides", inside,
    `x=${p.x.toFixed(2)} z=${p.z.toFixed(2)}`);
}

// The player must never end up overlapping anything they were pushed out of.
{
  const colliders = collidersFrom([FLOOR, box([0, 1.5, 0], [4, 3, 4])]);
  let worst = 0;
  for (let a = 0; a < 32; a += 1) {
    const angle = (a / 32) * Math.PI * 2;
    const p = at(Math.cos(angle) * 6, 0, Math.sin(angle) * 6);
    for (let i = 0; i < 300; i += 1) {
      step(p, -Math.cos(angle) * 0.06, -Math.sin(angle) * 0.06, colliders);
    }
    const intoX = 2 + PLAYER_RADIUS - Math.abs(p.x);
    const intoZ = 2 + PLAYER_RADIUS - Math.abs(p.z);
    worst = Math.max(worst, Math.min(intoX, intoZ));
  }
  check("a box cannot be entered from any direction", worst < 0.01,
    `deepest ${(worst * 1000).toFixed(1)}mm into the box`);
}

// A door is a collider that moves, and the player can be standing where it is
// going. This is the one that put somebody on the roof of a door: the swing
// closed around them, the next frame of gravity read that overlap as a landing,
// and the first step afterwards walked them out through the side of the hotel.
{
  const { generateFloor } = await import("../game/generation/generateFloor");
  const { buildFloor } = await import("../game/data/floor");
  const { doorFootprint, doorYaw, wouldHit } = await import("../game/systems/doors");

  const layout = buildFloor(generateFloor(4));
  const door = layout.doors[0]!;
  const leaf: AABB = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  const colliders = [...collidersFrom(layout.boxes), leaf];
  const swing = (progress: number) => doorFootprint(door, doorYaw(door, progress), leaf);

  // Standing in the middle of where the open leaf is going to be.
  const open = { ...swing(1) };
  const middle = (): Point3 =>
    at((open.minX + open.maxX) / 2, 0, (open.minZ + open.maxZ) / 2);

  // The swing, run the way the door's own frame loop runs it.
  {
    const p = middle();
    let progress = 0;
    let highest = 0;
    for (let i = 0; i < 120; i += 1) {
      const next = Math.min(1, progress + 1 / 60 / 0.9);
      if (!wouldHit(swing(next), p, PLAYER_HEIGHT)) progress = next;
      swing(progress);
      step(p, 0, 0, colliders);
      highest = Math.max(highest, p.y);
    }
    check("a door stops against the player instead of opening through them",
      progress < 0.5, `swung ${Math.round(progress * 100)}% of the way`);
    check("and leaves them standing where they were",
      highest < 0.01, `reached y=${highest.toFixed(2)}`);

    // And picks it up again once they are out of the way, or a door somebody
    // stood in front of once would never open again.
    p.z += 2.5;
    for (let i = 0; i < 120; i += 1) {
      const next = Math.min(1, progress + 1 / 60 / 0.9);
      if (!wouldHit(swing(next), p, PLAYER_HEIGHT)) progress = next;
      swing(progress);
    }
    check("and finishes the swing when they step out of it", progress === 1);
  }

  // The lift's panels are driven by the car and cannot wait for anybody, so
  // the floor has to survive a collider closing around the player anyway.
  {
    const p = middle();
    let highest = 0;
    for (let i = 0; i < 120; i += 1) {
      swing(Math.min(1, i / 54));
      step(p, 0, 0, colliders);
      highest = Math.max(highest, p.y);
    }
    check("a collider that closes around the player does not lift them onto it",
      highest < 0.01, `reached y=${highest.toFixed(2)}, the leaf is ${door.height}m tall`);

    // Walked out of, not thrown out of. The room is 4.5m deep and the corridor
    // wall is a metre away: anything further than that is through the building.
    const from = { ...p };
    for (let i = 0; i < 60; i += 1) step(p, 0.03, 0.03, colliders);
    const shoved = Math.hypot(p.x - from.x, p.z - from.z);
    check("and walking out of one is a step, not a launch", shoved < 2.5,
      `moved ${shoved.toFixed(2)}m in a second`);
    check("and they are still on the floor", Math.abs(p.y) < 0.01, `y=${p.y.toFixed(2)}`);
  }

  // The door is the thing that has to ask. The systems are pure; this is the
  // one line that wires them together.
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("apps/web/components/environment/HingedDoor.tsx", "utf8");
  check("the door asks before it swings",
    /if \(!wouldHit\(doorFootprint\(spec, doorYaw\(spec, next\), swept\), motion, motion\.height\)\) \{\s*\n\s*progress\.current = next;/
      .test(source),
    "and holds where it is when the answer is yes");
  check("and what is drawn is what is solid, on the frames it cannot move",
    /const yaw = doorYaw\(spec, progress\.current\);[\s\S]{0,160}doorFootprint\(spec, yaw, collider\);/.test(source),
    "a held door with a stale collider is a leaf you can walk through");
  check("and the player says where they are",
    /motion\.x = p\.x;/.test(readFileSync("apps/web/components/player/Player.tsx", "utf8")));
}

// Rotation is for art only. Everything in this file resolves against axis
// aligned boxes, so a rotated collider would stop the player somewhere other
// than where it is drawn, and nothing in the game would report the difference.
{
  const { generateFloor } = await import("../game/generation/generateFloor");
  const { buildFloor } = await import("../game/data/floor");

  const turned: string[] = [];
  for (const floor of [5, 4, 3, 2, 1, 0, -1, -2, -3]) {
    for (const box of buildFloor(generateFloor(floor)).boxes) {
      if (box.rotation && box.collides) turned.push(`${box.kind} on floor ${floor}`);
    }
  }
  check("no collider is rotated", turned.length === 0, turned.join(", ") || "nine floors");

  // And the thing that needs it is using it, or the rule guards a feature
  // nobody has.
  const rotated = buildFloor(generateFloor(5)).boxes.filter((b) => b.rotation);
  check("but the handrail is", rotated.length === 1, `${rotated.length} rotated boxes`);
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
