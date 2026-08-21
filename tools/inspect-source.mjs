import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/core";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const scene = root.listScenes()[0];

const rows = [];
const walk = (node, depth) => {
  const mesh = node.getMesh();
  if (mesh) {
    let tris = 0;
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      tris += idx ? idx.getCount() / 3 : prim.getAttribute("POSITION").getCount() / 3;
    }
    const b = getBounds(node);
    const size = [0, 1, 2].map((i) => +(b.max[i] - b.min[i]).toFixed(2));
    const mats = [...new Set(mesh.listPrimitives().map((p) => p.getMaterial()?.getName() ?? "?"))];
    rows.push({ name: node.getName(), mesh: mesh.getName(), tris, size, mats, depth });
  }
  node.listChildren().forEach((c) => walk(c, depth + 1));
};
scene.listChildren().forEach((n) => walk(n, 0));

rows.sort((a, b) => b.tris - a.tris);
console.log(`${"tris".padStart(8)}  ${"size (m)".padEnd(22)} node  /  mesh`);
for (const r of rows) {
  console.log(
    `${String(Math.round(r.tris)).padStart(8)}  ${JSON.stringify(r.size).padEnd(22)} ${r.name.slice(0, 40)}  /  ${r.mesh.slice(0, 30)}`,
  );
}
console.log(`\nnodes with meshes: ${rows.length}`);
const b = getBounds(scene);
console.log("scene bounds:", b.min.map((v) => +v.toFixed(1)), "->", b.max.map((v) => +v.toFixed(1)));
