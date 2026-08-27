import { PLAYER_HEIGHT, PLAYER_RADIUS, CROUCH_HEIGHT } from "../game/data/dimensions";
import {
  collidersFrom, isClear, isGrounded, moveAndCollide, STEP_HEIGHT,
} from "../game/systems/collision";
import type { BoxSpec, Point3 } from "../game/types";

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

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
