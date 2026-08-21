import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();

// Which node uses which material, and how big that surface is.
const users = new Map();
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const b = getBounds(node);
  const size = [0, 1, 2].map((i) => b.max[i] - b.min[i]);
  for (const prim of mesh.listPrimitives()) {
    const m = prim.getMaterial();
    if (!m) continue;
    const list = users.get(m) ?? [];
    list.push({ node: node.getName(), size });
    users.set(m, list);
  }
}

console.log(`${"material".padEnd(38)} ${"base texture".padEnd(40)} px      used by`);
for (const m of root.listMaterials()) {
  const tex = m.getBaseColorTexture();
  const size = tex?.getSize();
  const list = users.get(m) ?? [];
  const biggest = list.sort((a, b) => Math.max(...b.size) - Math.max(...a.size))[0];
  console.log(
    `${m.getName().slice(0, 37).padEnd(38)} ${(tex?.getName() ?? "-").slice(0, 39).padEnd(40)} ` +
    `${size ? `${size[0]}` : "-".padEnd(5)}   ${list.length}x  ${biggest ? biggest.node.slice(0, 30) : ""}` +
    `${biggest ? ` [${biggest.size.map((v) => v.toFixed(1)).join(",")}]` : ""}`,
  );
}
