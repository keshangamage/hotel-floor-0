import { FLOOR_5, FLOOR_5_LAYOUT } from "../game/data/floor";
import { createColliderSet } from "../game/systems/colliders";
import { moveAndCollide, isClear } from "../game/systems/collision";
import { CORRIDOR_HALF_WIDTH, PLAYER_HEIGHT, CEILING_HEIGHT } from "../game/data/dimensions";
import type { Point3 } from "../game/types";

let fail = 0;
const check = (n: string, ok: boolean, d = "") => { if (!ok) fail++; console.log(`${ok?"PASS":"FAIL"}  ${n}${d?"  "+d:""}`); };

const L = FLOOR_5_LAYOUT;
const C = createColliderSet(L.boxes).list;
const counts: Record<string, number> = {};
for (const b of L.boxes) counts[b.kind] = (counts[b.kind] ?? 0) + 1;
console.log(`boxes: ${L.boxes.length} ${JSON.stringify(counts)}`);
console.log(`colliders: ${C.length} | lights: ${L.lamps.length}\n`);

check("no degenerate or NaN boxes", L.boxes.every(b => b.size.every(s => Number.isFinite(s) && s > 1e-6)));
// The furniture and window units are imported meshes now. What stays hand
// built is the room's woodwork and two panes of glazing: the guest room's
// window and the one at the corridor's dead end.
check("hand-built furniture kinds are present",
  (counts.wood ?? 0) > 0 && (counts.glass ?? 0) === 2,
  `wood ${counts.wood ?? 0}, glass ${counts.glass ?? 0}`);

// Nothing may be left inside the ceiling or below the floor.
check("all furniture sits within the room height",
  L.boxes.filter(b => b.kind === "wood" || b.kind === "fabric")
    .every(b => b.position[1] - b.size[1]/2 >= -0.01 && b.position[1] + b.size[1]/2 <= CEILING_HEIGHT + 0.01));

// The spawn must be standable now that there is furniture in the way.
const spawn: Point3 = { x: L.spawn[0], y: L.spawn[1], z: L.spawn[2] };
check("spawn is clear of all furniture", isClear(spawn, PLAYER_HEIGHT, C),
  `(${L.spawn.map(n => n.toFixed(2)).join(", ")})`);

// The whole point of a furnished room: you can still get out of it.
const out: Point3 = { ...spawn };
for (let i = 0; i < 400; i++) moveAndCollide(out, { x: 0.05, y: -0.05, z: 0 }, PLAYER_HEIGHT, C);
check("can still walk out of furnished 507 into the corridor",
  Math.abs(out.x) < CORRIDOR_HALF_WIDTH, `x=${out.x.toFixed(2)}`);

// And back in again, which the wardrobe beside the door could easily block.
const back: Point3 = { x: 0, y: 0, z: -6 };
for (let i = 0; i < 400; i++) moveAndCollide(back, { x: -0.05, y: -0.05, z: 0 }, PLAYER_HEIGHT, C);
check("can walk back into the room through the doorway",
  back.x < -(CORRIDOR_HALF_WIDTH + 0.5), `x=${back.x.toFixed(2)}`);

// Furniture must be solid, not scenery. Probe from the bed's real position:
// hardcoded coordinates went stale when the room frame changed.
const bedProp = L.props.find((p) => p.instanceId.endsWith("-bed"))!;
const bedFar = bedProp.position[0] - 1.05;
const intoBed: Point3 = { x: bedProp.position[0] + 1.6, y: 0, z: bedProp.position[2] };
check("the probe starts on clear floor", isClear(intoBed, PLAYER_HEIGHT, C),
  `x=${intoBed.x.toFixed(2)} z=${intoBed.z.toFixed(2)}`);
for (let i = 0; i < 200; i++) moveAndCollide(intoBed, { x: -0.05, y: -0.05, z: 0 }, PLAYER_HEIGHT, C);
check("the bed is solid", intoBed.x > bedFar,
  `stopped at x=${intoBed.x.toFixed(2)}, bed's far edge is ${bedFar.toFixed(2)}`);

// Window: an aperture in the exterior wall, with a pane and outside light.
const pane = L.boxes.find(b => b.kind === "glass");
check("window pane exists and does not collide", pane !== undefined && !pane.collides);
check("window sits above floor level", (pane?.position[1] ?? 0) > 1.0, `y=${pane?.position[1].toFixed(2)}`);
check("room 507 has a bedside lamp, window spill and a floor bounce",
  L.lamps.filter(l => l.kind === "bare").length === 3,
  `${L.lamps.filter(l => l.kind === "bare").length}`);
const overhead = L.lamps.filter(l => l.kind === "spot");
check("the room's brightest source is overhead",
  overhead.length === 1 && overhead[0]!.position[1] > 2.0,
  overhead.map(l => `y=${l.position[1].toFixed(2)}`).join(""));
// Without a caster the furniture has no contact with the floor.
check("the overhead light casts shadows", overhead.every(l => l.castShadow));
// Nothing below knee height gets light otherwise, which made the bed read as
// sitting on the floor.
check("the room has light below knee height",
  L.lamps.some(l => l.kind === "bare" && l.position[1] < 0.5),
  L.lamps.filter(l => l.kind === "bare").map(l => `y=${l.position[1].toFixed(2)}`).join(", "));
check("507 has no ceiling downlight", FLOOR_5.rooms.find(r => r.number === 507)?.lit === false);

// The light budget lives in budget.test.ts now: this floor is the cheapest
// case, and the number that matters is the worst one across every hotel,
// floor and anomaly.

// Determinism still holds with furniture in the mix.
import("../game/data/floor").then((m) => {
  check("buildFloor is still deterministic",
    JSON.stringify(m.buildFloor(FLOOR_5)) === JSON.stringify(m.buildFloor(FLOOR_5)));
  console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
  process.exit(fail === 0 ? 0 : 1);
});
