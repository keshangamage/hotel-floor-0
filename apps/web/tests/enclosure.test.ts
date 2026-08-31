import { buildFloor } from "../game/data/floor";
import { CEILING_HEIGHT, CORRIDOR_HALF_WIDTH } from "../game/data/dimensions";
import { generateFloor } from "../game/generation/generateFloor";
import type { BoxSpec, FloorLayout } from "../game/types";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const spans = (box: BoxSpec, axis: 0 | 1 | 2, v: number) => {
  const half = box.size[axis] / 2;
  return v >= box.position[axis] - half - 1e-6 && v <= box.position[axis] + half + 1e-6;
};
const covers = (box: BoxSpec, x: number, z: number) => spans(box, 0, x) && spans(box, 2, z);

/**
 * Highest surface under a point, or null where there is nothing.
 *
 * A hole in the floor is invisible from most angles and fatal from one, which
 * is how a gap at the elevator threshold survived until something looked
 * straight down at every point along the corridor.
 */
function floorUnder(layout: FloorLayout, x: number, z: number): number | null {
  let top: number | null = null;
  for (const box of layout.boxes) {
    if (!covers(box, x, z)) continue;
    const surface = box.position[1] + box.size[1] / 2;
    if (surface > 0.4) continue;
    if (top === null || surface > top) top = surface;
  }
  return top;
}

function ceilingOver(layout: FloorLayout, x: number, z: number): number | null {
  let low: number | null = null;
  for (const box of layout.boxes) {
    if (!covers(box, x, z)) continue;
    const underside = box.position[1] - box.size[1] / 2;
    if (underside < CEILING_HEIGHT - 0.3) continue;
    if (low === null || underside < low) low = underside;
  }
  return low;
}

/**
 * Several hotels, not one.
 *
 * Corridor length is drawn per hotel now, so a single seed no longer says much
 * about the shape a player might get. A short tail puts the end wall close to
 * the last doorway and a long one stretches the floor slab, and only one of
 * those is going to be the seed this file happens to use.
 */
const HOTELS = ["night-porter", "s3", "s17", "s42", "s88"];

for (const seed of HOTELS) {
  for (const floorNumber of [5, 3, 0]) {
    const spec = generateFloor(floorNumber, seed);
    const layout = buildFloor(spec);
    const label = `${seed} floor ${floorNumber}`;

    // Every step of the corridor, across its full width.
    const holes: string[] = [];
    const open: string[] = [];
    for (let z = spec.corridorFrom + 0.2; z < spec.corridorTo - 0.2; z += 0.25) {
      for (const x of [-0.8, -0.4, 0, 0.4, 0.8]) {
        if (floorUnder(layout, x, z) === null) holes.push(`(${x}, ${z.toFixed(1)})`);
        if (ceilingOver(layout, x, z) === null) open.push(`(${x}, ${z.toFixed(1)})`);
      }
    }
    check(`${label}: the corridor has a floor everywhere`,
      holes.length === 0, holes.slice(0, 3).join(" ") || "no gaps");
    check(`${label}: and a ceiling everywhere`,
      open.length === 0, open.slice(0, 3).join(" ") || "sealed");

    // The floor must be one level, or there is a lip to trip over.
    const levels = new Set<string>();
    for (let z = spec.corridorFrom + 0.4; z < spec.corridorTo - 0.4; z += 0.5) {
      const top = floorUnder(layout, 0, z);
      if (top !== null) levels.add(top.toFixed(3));
    }
    check(`${label}: the corridor floor is level`, levels.size === 1,
      [...levels].join(", "));

    // Walls on both sides, all the way along.
    const leaks: string[] = [];
    for (let z = spec.corridorFrom + 0.3; z < spec.corridorTo - 0.3; z += 0.3) {
      for (const side of [-1, 1]) {
        const x = side * (CORRIDOR_HALF_WIDTH + 0.05);
        const walled = layout.boxes.some((b) =>
          covers(b, x, z) && b.position[1] + b.size[1] / 2 > 1.0 && b.position[1] - b.size[1] / 2 < 1.0);
        // A doorway is a hole on purpose, so only count where no door is.
        const doorway = layout.doors.some((d) => Math.abs(d.hinge[2] + d.width / 2 - z) < d.width);
        if (!walled && !doorway) leaks.push(`${side > 0 ? "+" : "-"}x @ ${z.toFixed(1)}`);
      }
    }
    check(`${label}: the corridor is walled on both sides`,
      leaks.length === 0, leaks.slice(0, 3).join(", ") || "sealed");
  }
}

// Lamps sit on a 4m pitch and doors alternate every 2m, so a lamp placed on
// the room pitch lights one side and leaves the other in the dark. Every door
// has to fall inside a cone, at the heights a player actually looks.
// Fixtures march back from the lift, so a longer hotel simply gets more of
// them. Checked across hotels anyway: the rule is about the offset between the
// lamp pitch and the door pitch, and that is worth proving on more than one
// corridor length.
{
  let checked = 0;
  const strandedAnywhere: string[] = [];
  const gaps: number[] = [];

  for (const seed of HOTELS) {
    const spec = generateFloor(5, seed);
    const layout = buildFloor(spec);
    const lit = layout.lamps.filter((l) => l.lit !== false && l.position[1] > CEILING_HEIGHT - 0.3);
    if (lit.length === 0) { strandedAnywhere.push(`${seed}: no fixtures`); continue; }

    /**
     * Doors alternate every 2m and fixtures sit on a 4m pitch, so fixtures
     * placed on the room pitch sit directly over one side and leave the other
     * 2m away. The 1m offset in the generator is what puts every door within
     * reach of one, and this is the number that says so.
     *
     * Modelling the geometric cone instead is useless: at a 71 degree half
     * angle it reaches 2.1m by head height, so it passes a door barely grazed.
     */
    const NEAREST = 1.5;
    for (const room of spec.rooms) {
      let nearest = Infinity;
      for (const lamp of lit) nearest = Math.min(nearest, Math.abs(lamp.position[2] - room.doorZ));
      checked += 1;
      if (nearest > NEAREST) {
        strandedAnywhere.push(`${seed}/${room.number} is ${nearest.toFixed(1)}m from one`);
      }
    }

    const zs = lit.map((l) => l.position[2]).sort((a, b) => a - b);
    for (let i = 1; i < zs.length; i += 1) gaps.push(zs[i]! - zs[i - 1]!);
  }

  check("there are doors to check", checked > 30, `${checked} doors across ${HOTELS.length} hotels`);
  check("every door is within reach of a fixture",
    strandedAnywhere.length === 0,
    strandedAnywhere.slice(0, 4).join(", ") || `${checked} doors, furthest within 1.5m`);
  const worst = gaps.reduce((m, g) => Math.max(m, g), 0);
  check("no stretch of corridor is left between lamps", worst <= 4.5,
    `worst gap ${worst.toFixed(1)}m`);
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
