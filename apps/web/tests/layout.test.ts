import { FLOOR_5, FLOOR_5_LAYOUT } from "../game/data/floor";
import { PROP_SIZES } from "../game/data/propSizes.generated";
import { createColliderSet, emptyCollider } from "../game/systems/colliders";
import { doorFootprint } from "../game/systems/doors";
import { moveAndCollide, isClear } from "../game/systems/collision";
import { CEILING_HEIGHT, PLAYER_HEIGHT, CORRIDOR_HALF_WIDTH, WINDOW_WIDTH, WINDOW_SILL, WINDOW_TOP } from "../game/data/dimensions";
import type { Point3 } from "../game/types";

let fail = 0;
const check = (n: string, ok: boolean, d = "") => { if (!ok) fail++; console.log(`${ok?"PASS":"FAIL"}  ${n}${d?"  "+d:""}`); };

const L = FLOOR_5_LAYOUT;
const room = FLOOR_5.rooms.find((r) => r.furnished)!;
const set = createColliderSet(L.boxes);
for (const d of L.doors) {
  const b = emptyCollider();
  doorFootprint(d, d.label === "507" ? d.openYaw : d.closedYaw, b);
  set.add(b);
}
const C = set.list;

const roomProps = L.props.filter((p) => p.instanceId.startsWith(`room-${room.number}-`));
console.log(`room ${room.number}: ${roomProps.length} props, ${L.boxes.filter(b => b.visible === false).length} colliders\n`);

// Every collider must match the mesh it stands for.
const blockers = L.boxes.filter((b) => b.visible === false);
const mismatched: string[] = [];
for (const prop of roomProps) {
  const size = PROP_SIZES[prop.id as keyof typeof PROP_SIZES];
  if (!size) continue;
  const scale = prop.scale ?? 1;
  const near = blockers.find((b) =>
    Math.abs(b.position[0] - prop.position[0]) < 0.02 &&
    Math.abs(b.position[2] - prop.position[2]) < 0.02);
  if (!near) continue;
  const wanted = [size[0] * scale, size[2] * scale].sort((a, b) => a - b);
  const got = [near.size[0], near.size[2]].sort((a, b) => a - b);
  if (Math.abs(wanted[0]! - got[0]!) > 0.02 || Math.abs(wanted[1]! - got[1]!) > 0.02)
    mismatched.push(`${prop.id}: mesh ${wanted.map(v=>v.toFixed(2))} vs collider ${got.map(v=>v.toFixed(2))}`);
}
check("every collider matches its mesh footprint", mismatched.length === 0, mismatched.join("; "));

// Nothing may overlap anything else on the floor.
const standing = blockers.filter((b) => b.position[1] - b.size[1] / 2 < 0.05 && b.size[1] > 0.2);
// Name each collider by the prop nearest it, so failures are readable.
const nameOf = (b: typeof standing[number]) =>
  roomProps
    .map((p) => ({ id: p.id, d: Math.hypot(p.position[0] - b.position[0], p.position[2] - b.position[2]) }))
    .sort((x, y) => x.d - y.d)[0]?.id ?? "?";
const overlaps: string[] = [];
for (let i = 0; i < standing.length; i++)
  for (let j = i + 1; j < standing.length; j++) {
    const a = standing[i]!, b = standing[j]!;
    // Interval intersection, not penetration depth: penetration can exceed the
    // smaller box's own size when one is contained in the other.
    const span = (axis: 0 | 2) =>
      Math.min(a.position[axis] + a.size[axis] / 2, b.position[axis] + b.size[axis] / 2) -
      Math.max(a.position[axis] - a.size[axis] / 2, b.position[axis] - b.size[axis] / 2);
    const ox = span(0);
    const oz = span(2);
    if (ox <= 0.02 || oz <= 0.02) continue;
    // A chair tucks under a desk, so a small overlap is furniture working. Only
    // a piece substantially embedded in another is a fault.
    const area = ox * oz;
    const smaller = Math.min(a.size[0] * a.size[2], b.size[0] * b.size[2]);
    if (area / smaller > 0.4)
      overlaps.push(`${nameOf(a)}+${nameOf(b)} ${(area / smaller * 100).toFixed(0)}%`);
  }
check("no two pieces of furniture overlap", overlaps.length === 0, overlaps.join(", "));

// Everything must fit inside the room.
const outside = roomProps.filter((p) => {
  const size = PROP_SIZES[p.id as keyof typeof PROP_SIZES];
  if (!size) return false;
  const top = (p.position[1] ?? 0) + size[1] * (p.scale ?? 1);
  return top > CEILING_HEIGHT + 0.01;
});
check("nothing pokes through the ceiling", outside.length === 0, outside.map(p => p.id).join(", "));

// The spawn must be standable.
const spawn: Point3 = { x: L.spawn[0], y: L.spawn[1], z: L.spawn[2] };
check("spawn is clear", isClear(spawn, PLAYER_HEIGHT, C),
  `(${L.spawn.map(v => v.toFixed(2)).join(", ")})`);

// And the player must be able to walk out, and reach the window.
const out: Point3 = { ...spawn };
for (let i = 0; i < 400; i++) moveAndCollide(out, { x: 0.05, y: -0.05, z: 0 }, PLAYER_HEIGHT, C);
check("can walk from the spawn out into the corridor",
  Math.abs(out.x) < CORRIDOR_HALF_WIDTH, `x=${out.x.toFixed(2)}`);

const inward: Point3 = { ...spawn };
for (let i = 0; i < 400; i++) moveAndCollide(inward, { x: -0.05, y: -0.05, z: 0 }, PLAYER_HEIGHT, C);
const reachedBack = Math.abs(inward.x) > Math.abs(spawn.x) + 1.5;
check("can walk from the spawn to the far end of the room", reachedBack,
  `travelled ${(Math.abs(inward.x) - Math.abs(spawn.x)).toFixed(2)}m`);

// Ceiling fixtures must clear the player.
// The window is set into the wall rather than suspended over the floor, so it
// is never something the player can walk into.
const hung = roomProps.filter((p) => p.id !== "window" && (p.position[1] ?? 0) > 1.0);
check("hung fixtures clear head height",
  hung.every((p) => p.position[1] > PLAYER_HEIGHT + 0.35),
  hung.map(p => `${p.id} ${(p.position[1] - PLAYER_HEIGHT).toFixed(2)}m`).join(", "));

// Both rooms on either wall must furnish identically, not mirrored.
// The aperture is punched by the floor builder and dressed by the furnisher.
// They use the same frame, so a convention change cannot separate them again.
const pane = L.boxes.find((b) => b.kind === "glass")!;
// The window unit is a separate mesh laid over a hole in the wall, so if it is
// mistuned the opening shows daylight around its edges.
{
  const unit = roomProps.find((p) => p.id === "window");
  if (!unit) {
    check("the window unit stands in the opening", false, "no window prop");
  } else {
    // Quarter turned, so its width runs along Z and its depth along X.
    // The unit is scaled down, so measure the size it actually renders at.
    const k = unit.scale ?? 1;
    const [sx0, sy0, sz0] = PROP_SIZES.window;
    const [sx, sy, sz] = [sx0 * k, sy0 * k, sz0 * k];
    const halfWide = sx / 2;
    const base = unit.position[1] ?? 0;
    const apertureHalf = WINDOW_WIDTH / 2;
    const dz = Math.abs(unit.position[2] - pane.position[2]);
    check("the window unit covers the opening across its width",
      dz + apertureHalf <= halfWide,
      `frame reaches ${(halfWide - dz).toFixed(2)}m either side of a ${apertureHalf.toFixed(2)}m half-opening`);
    check("the window unit covers the opening top and bottom",
      base <= WINDOW_SILL && base + sy >= WINDOW_TOP,
      `frame ${base.toFixed(2)}..${(base + sy).toFixed(2)} over opening ${WINDOW_SILL}..${WINDOW_TOP}`);
    // It sits high on the wall now, so the ceiling is what it runs into.
    check("the window unit stays under the ceiling",
      base + sy <= CEILING_HEIGHT,
      `top at ${(base + sy).toFixed(2)}m, ceiling ${CEILING_HEIGHT}m, header ${(CEILING_HEIGHT - base - sy).toFixed(2)}m`);
    check("the window unit sits in the wall, not out in the room",
      Math.abs(Math.abs(unit.position[0]) - Math.abs(pane.position[0])) < sz,
      `${Math.abs(Math.abs(unit.position[0]) - Math.abs(pane.position[0])).toFixed(2)}m from the pane, depth ${sz.toFixed(2)}m`);
  }
}

// Nothing standing on the floor may clip through the rug, which is what made
// the bed's legs look like they went under the floor.
const rug = roomProps.find((p) => p.id === "rug");
if (rug) {
  const rugTop = (rug.position[1] ?? 0) + PROP_SIZES.rug[1] * (rug.scale ?? 1);
  check("the rug lies flush with the floor", rugTop <= 0.006,
    `rug top y=${rugTop.toFixed(4)}`);
  // Furniture rests at y=0, so anything the rug stands proud of it clips by
  // that amount. A few millimetres is invisible; a centimetre swallows a leg.
  check("the rug is too thin to swallow a leg", rugTop < 0.01,
    `furniture clips by ${(rugTop * 1000).toFixed(1)}mm`);
}

// Everything on the floor must rest exactly on it.
// The window is fixed in the wall, so it is the one prop not on the floor.
const floating = roomProps.filter((p) => p.id !== "window"
  && (p.position[1] ?? 0) > 0.001 && (p.position[1] ?? 0) < 1.0);
check("floor-standing props rest on the floor", floating.length === 0,
  floating.map((p) => `${p.id}@${p.position[1].toFixed(3)}`).join(", "));

// The bedside lamp is positioned by hand rather than parented to the table, so
// nothing stops it floating in the air or sinking into the top when the table
// is swapped.
{
  const lamp = L.lamps.find((l) => l.id?.endsWith("-bedside"));
  const table = L.props.find((p) => p.id === "nightstand");
  if (!lamp || !table) {
    check("the bedside lamp stands on the nightstand", false, "lamp or nightstand missing");
  } else {
    const [sx, sy, sz] = PROP_SIZES.nightstand;
    // The table is quarter turned, so its extents swap.
    const halfX = sz / 2;
    const halfZ = sx / 2;
    const dx = Math.abs(lamp.position[0] - table.position[0]);
    const dz = Math.abs(lamp.position[2] - table.position[2]);
    check("the bedside lamp stands over the nightstand",
      dx <= halfX && dz <= halfZ,
      `offset ${dx.toFixed(2)}m x ${dz.toFixed(2)}m within ${halfX.toFixed(2)} x ${halfZ.toFixed(2)}`);
    // The shade is around 0.28m tall, so the bulb sits that far above the top.
    const above = lamp.position[1] - sy;
    check("the bedside lamp sits on the table top, not in it or above it",
      above > 0.1 && above < 0.45, `bulb ${above.toFixed(2)}m above the ${sy.toFixed(2)}m top`);
  }
}

// The game explains itself exactly once, on a note in the guest room. If it
// is missing, floating, or unreadable, a new player has no rules at all.
{
  const note = L.notes.find((n) => n.id.includes("507"));
  check("the guest room has a notice", note !== undefined, `${L.notes.length} notes`);

  if (note) {
    const desk = roomProps.find((p) => p.id === "desk");
    if (desk) {
      const [dx, dy, dz] = PROP_SIZES.desk;
      // It has to sit on the desk, not hover over it or sink into it.
      const above = note.position[1] - dy;
      check("the notice lies on the desk top", above > 0 && above < 0.02,
        `${(above * 1000).toFixed(0)}mm above the ${dy.toFixed(2)}m top`);
      const withinX = Math.abs(note.position[0] - desk.position[0]) <= dz / 2;
      const withinZ = Math.abs(note.position[2] - desk.position[2]) <= dx / 2;
      check("and within its edges", withinX && withinZ,
        `${Math.abs(note.position[0] - desk.position[0]).toFixed(2)} x ${Math.abs(note.position[2] - desk.position[2]).toFixed(2)}`);
    }

    check("the notice actually says something", note.lines.some((l) => l.length > 0),
      `${note.lines.filter((l) => l).length} lines`);
    // It has to state the rule, or it is set dressing rather than the tutorial.
    const text = note.lines.join(" ").toLowerCase();
    check("it states both halves of the rule",
      text.includes("up") && text.includes("down"),
      text.slice(0, 60) + "...");
  }
}

// Every link from the paper to the words on screen.
{
  const { readFileSync } = await import("node:fs");
  const read = (f: string) =>
    readFileSync(`apps/web/${f}`, "utf8");
  check("the note is interactable", /Interactable/.test(read("components/environment/Note.tsx")));
  check("reading it reaches the store", /readNote/.test(read("components/environment/Note.tsx")));
  check("something renders the text", /note\.lines/.test(read("components/ui/NoteOverlay.tsx")));
  check("the overlay is mounted", /<NoteOverlay/.test(read("components/game/GameShell.tsx")));
  // Without this the driver reopens the note on the frame it was closed.
  check("the same key puts it down again",
    /reading[\s\S]{0,200}consumePress\("interact"\)/.test(read("components/player/InputActions.tsx")));
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
