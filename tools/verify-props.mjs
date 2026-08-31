import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { stat } from "node:fs/promises";

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });

const path = "apps/web/public/models/props.glb";
const doc = await io.read(path);
const root = doc.getRoot();

let fail = 0;
const check = (n, ok, d = "") => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };

console.log(`file: ${((await stat(path)).size / 1e6).toFixed(2)} MB`);
console.log(`extensions: ${root.listExtensionsUsed().map((e) => e.extensionName).join(", ")}\n`);

// Textures
let vram = 0;
let maxDim = 0;
const formats = new Set();
for (const tex of root.listTextures()) {
  const size = tex.getSize() ?? [0, 0];
  maxDim = Math.max(maxDim, size[0], size[1]);
  formats.add(tex.getMimeType());
  // Uncompressed RGBA in VRAM, plus a third again for mipmaps.
  vram += size[0] * size[1] * 4 * 1.333;
}
console.log(`textures: ${root.listTextures().length}, formats ${[...formats].join(",")}, max ${maxDim}px`);
console.log(`estimated VRAM: ${(vram / 1e6).toFixed(0)} MB  (source was ~2700 MB)\n`);

check("every texture is WebP", formats.size === 1 && formats.has("image/webp"));
check("no texture exceeds 1024px", maxDim <= 1024, `${maxDim}px`);
check("VRAM fits a sane budget", vram / 1e6 < 200, `${(vram / 1e6).toFixed(0)} MB`);
check("geometry is meshopt compressed",
  root.listExtensionsUsed().some((e) => e.extensionName === "EXT_meshopt_compression"));
check("no Draco, which would need a CDN decoder",
  !root.listExtensionsUsed().some((e) => e.extensionName.includes("draco")));

// Props
const EXPECTED = ["chandelier"];
const scene = root.listScenes()[0];
const nodes = scene.listChildren().filter((n) => n.getMesh());
check("all eight props are present", nodes.length === 8, `${nodes.length}`);
check("props are named for the game",
  EXPECTED.every((id) => nodes.some((n) => n.getName() === id)),
  nodes.map((n) => n.getName()).join(", "));

let offOrigin = [];
let offFloor = [];
for (const node of nodes) {
  const b = getBounds(node);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  if (Math.abs(cx) > 0.01 || Math.abs(cz) > 0.01) offOrigin.push(node.getName());
  if (Math.abs(b.min[1]) > 0.01) offFloor.push(`${node.getName()}@${b.min[1].toFixed(2)}`);
}
check("every prop is centred on the origin", offOrigin.length === 0, offOrigin.join(","));
check("every prop's base sits at y=0", offFloor.length === 0, offFloor.join(","));

let tris = 0;
for (const mesh of root.listMeshes())
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    tris += idx ? idx.getCount() / 3 : prim.getAttribute("POSITION").getCount() / 3;
  }
console.log(`\ntriangles: ${Math.round(tris).toLocaleString()}`);
check("triangle budget is reasonable", tris < 60000, `${Math.round(tris)}`);
check("every prop has a material",
  root.listMeshes().every((m) => m.listPrimitives().every((p) => p.getMaterial() !== null)));

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
