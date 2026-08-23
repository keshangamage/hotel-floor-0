/**
 * Prints what a glTF source actually contains, before wiring it into the
 * library. Answers the questions that decide how a prop is placed: how big it
 * is, which way is up, which way it faces, and whether it ships the maps it
 * needs to look like anything.
 *
 *   node tools/inspect-asset.mjs some_asset.glb
 */
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";

const file = process.argv[2];
if (!file) {
  console.error("usage: node tools/inspect-asset.mjs <file.glb>");
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(file);
const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh());

let triangles = 0;
console.log("meshes:");
for (const node of nodes) {
  let t = 0;
  for (const prim of node.getMesh().listPrimitives()) t += prim.getIndices().getCount() / 3;
  triangles += t;
  const b = getBounds(node);
  const size = [0, 1, 2].map((i) => (b.max[i] - b.min[i]).toFixed(2)).join(" x ");
  console.log(`  ${node.getName().slice(0, 32).padEnd(33)} ${String(Math.round(t)).padStart(7)} tris  ${size}`);
}

const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (const node of nodes) {
  const b = getBounds(node);
  for (const i of [0, 1, 2]) {
    box.min[i] = Math.min(box.min[i], b.min[i]);
    box.max[i] = Math.max(box.max[i], b.max[i]);
  }
}
const extent = [0, 1, 2].map((i) => box.max[i] - box.min[i]);
console.log(`\n${nodes.length} node(s), ${Math.round(triangles).toLocaleString()} triangles`);
console.log(`size once the build bakes the node transform: ${extent.map((v) => v.toFixed(3)).join(" x ")}`);

console.log("\nmaterials:");
for (const m of doc.getRoot().listMaterials()) {
  console.log(`  "${m.getName()}"  rough=${m.getRoughnessFactor().toFixed(2)} metal=${m.getMetallicFactor().toFixed(2)}`);
  for (const slot of ["BaseColor", "Normal", "MetallicRoughness", "Occlusion"]) {
    const t = m[`get${slot}Texture`]?.();
    if (!t) {
      // No normal map means a flat surface at any lighting setup. The build
      // derives one from the albedo, but a shipped map is always better.
      console.log(`      ${slot.padEnd(18)} none${slot === "Normal" ? "   (build will derive one)" : ""}`);
      continue;
    }
    const meta = await sharp(Buffer.from(t.getImage())).metadata().catch(() => ({}));
    console.log(`      ${slot.padEnd(18)} ${meta.width}x${meta.height} ${meta.format}`);
  }
}

// Everything below works in the space the build produces, with the node
// transform baked in, so it describes the prop as the game will see it.
const points = [];
const tris = [];
for (const node of nodes) {
  const m = node.getWorldMatrix();
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute("POSITION").getArray();
    const base = points.length;
    for (let i = 0; i < pos.length; i += 3) {
      const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]];
      points.push([
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      ]);
    }
    const idx = prim.getIndices().getArray();
    for (let t = 0; t < idx.length; t += 3) tris.push([base + idx[t], base + idx[t + 1], base + idx[t + 2]]);
  }
}

function faces() {
  const out = [];
  for (const [i, j, k] of tris) {
    const [A, B, C] = [points[i], points[j], points[k]];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n);
    if (!len) continue;
    out.push({ area: len / 2, normal: n.map((c) => c / len), centre: [0, 1, 2].map((a) => (A[a] + B[a] + C[a]) / 3) });
  }
  return out;
}
const F = faces();

// The up axis carries the most flat surface, since floors, tops and shelves
// are all horizontal. Where that area sits along the axis says which end is up.
console.log("\nflat-face area by axis (the up axis dominates):");
for (const ax of [0, 1, 2]) {
  let area = 0;
  let weighted = 0;
  for (const f of F) {
    if (Math.abs(f.normal[ax]) <= 0.9) continue;
    area += f.area;
    weighted += f.area * f.centre[ax];
  }
  const pct = area ? ((weighted / area - box.min[ax]) / extent[ax] * 100).toFixed(0) : "  -";
  console.log(`  ${"XYZ"[ax]}  area ${area.toFixed(3).padStart(9)}   centred ${String(pct).padStart(3)}% along the axis`);
}

// A back panel is a large surface facing away from the piece. Whichever
// horizontal direction carries more surface is the back, so it faces the other.
console.log("\nwhich way it faces:");
for (const ax of [0, 2]) {
  const mid = (box.min[ax] + box.max[ax]) / 2;
  let plus = 0;
  let minus = 0;
  for (const f of F) {
    if (Math.abs(f.normal[ax]) <= 0.9) continue;
    if (f.centre[ax] > mid) plus += f.area; else minus += f.area;
  }
  const verdict = Math.abs(plus - minus) < Math.max(plus, minus) * 0.25
    ? "symmetric"
    : `back at ${plus > minus ? "+" : "-"}${"XYZ"[ax]}, so it faces ${plus > minus ? "-" : "+"}${"XYZ"[ax]}`;
  console.log(`  ${"XYZ"[ax]}: +${"XYZ"[ax]} ${plus.toFixed(3)}, -${"XYZ"[ax]} ${minus.toFixed(3)}   ${verdict}`);
}

// Upward surfaces above the floor are what a prop can carry: a seat, a
// tabletop, a shelf.
const bins = new Map();
for (const f of F) {
  if (f.normal[1] <= 0.9) continue;
  const h = Math.round((f.centre[1] - box.min[1]) * 50) / 50;
  bins.set(h, (bins.get(h) ?? 0) + f.area);
}
const top = [...bins].filter(([h]) => h > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 4);
if (top.length) {
  console.log("\nupward surfaces above the floor (a top, seat or shelf):");
  for (const [h, a] of top) console.log(`  height ${h.toFixed(2)}m   area ${a.toFixed(3)}`);
}
