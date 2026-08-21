/**
 * Extracts a curated prop library from a large source GLB and optimises it for
 * the browser. Run offline; the source asset is never committed or shipped.
 *
 *   node --max-old-space-size=8192 tools/build-props.mjs <source.glb>
 */
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup, flatten, meshopt, prune, resample, simplifyPrimitive, textureCompress, transformMesh, weld,
} from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";

/** id is the name the game uses; node is a prefix of the source node name. */
const PROPS = [
  { id: "armchair",       node: "chair2",                            ratio: 0.5,  texture: 1024 },
  { id: "desk",           node: "S_Dirty_Wooden_Table",              ratio: 0.8,  texture: 1024 },
  { id: "sideboard",      node: "victorian_coffee_table",            ratio: 0.9,  texture: 1024 },
  { id: "chandelier",     node: "lantern_chandelier_01_4k",          ratio: 0.7,  texture: 1024 },
  { id: "painting-large", node: "fancy_picture_frame",               ratio: 1,    texture: 1024 },
  { id: "painting-small", node: "fancy_picture_frame_011",           ratio: 1,    texture: 512 },
  { id: "painting-square",node: "fancy_victorian_square_picture",    ratio: 1,    texture: 512 },
  { id: "crate",          node: "S_Metal_Containers_Pack",           ratio: 1,    texture: 512 },
];

const OUT = "apps/web/public/models/props.glb";
const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

// The meshopt extension takes its encoder from IO dependencies, not from the
// meshopt() transform, so writing fails without this.
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const source = process.argv[2];
console.log(`reading ${source} (${mb((await stat(source)).size)})`);
const doc = await io.read(source);

// Bake ancestor transforms down so each node carries its own world transform.
await doc.transform(flatten());

const root = doc.getRoot();
const scene = root.listScenes()[0];

// Pick exactly one node per prop, preferring the shortest matching name so we
// get the original rather than a numbered duplicate.
const chosen = new Map();
const all = root.listNodes().filter((n) => n.getMesh());
for (const prop of PROPS) {
  const matches = all
    .filter((n) => n.getName().startsWith(prop.node))
    .sort((a, b) => a.getName().length - b.getName().length);
  const node = matches[0];
  if (!node) {
    console.error(`  MISSING  ${prop.id}: no node starting with "${prop.node}"`);
    continue;
  }
  chosen.set(node, prop);
}

// Drop everything else from the scene.
for (const node of root.listNodes()) {
  if (!chosen.has(node)) node.dispose();
}

// Bake each prop's transform into its vertices, then sit it at the origin with
// its base on the floor, so the game can place it without per-prop fudging.
const manifest = [];
for (const [node, prop] of chosen) {
  const mesh = node.getMesh();
  transformMesh(mesh, node.getWorldMatrix());
  node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);

  const b = getBounds(node);
  const centre = [(b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2];
  transformMesh(mesh, [1,0,0,0, 0,1,0,0, 0,0,1,0, -centre[0], -centre[1], -centre[2], 1]);

  node.setName(prop.id);
  mesh.setName(prop.id);
  if (!scene.listChildren().includes(node)) scene.addChild(node);

  const size = getBounds(node);
  manifest.push({
    id: prop.id,
    size: [0, 1, 2].map((i) => +(size.max[i] - size.min[i]).toFixed(3)),
  });
}

const triangles = (d) =>
  d.getRoot().listMeshes().reduce((sum, m) =>
    sum + m.listPrimitives().reduce((t, p) => {
      const idx = p.getIndices();
      return t + (idx ? idx.getCount() / 3 : p.getAttribute("POSITION").getCount() / 3);
    }, 0), 0);

await doc.transform(prune(), dedup(), resample(), weld());
const before = triangles(doc);
console.log(`kept ${chosen.size} props, ${Math.round(before).toLocaleString()} triangles`);

// Decimate per prop. simplify() runs over the whole document, so the ratios
// would compound across every mesh; simplifyPrimitive targets one prop.
for (const [node, prop] of chosen) {
  if (prop.ratio >= 1) continue;
  for (const prim of node.getMesh().listPrimitives()) {
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: prop.ratio, error: 0.005 });
  }
}
console.log(`decimated to ${Math.round(triangles(doc)).toLocaleString()} triangles`);

// The real win: 4K PNGs become small WebP. PNG is only compressed on disk, so
// the resize is what actually protects VRAM.
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 88 }),
);

// Second pass for props that do not need a full 1024. A texture shared between
// props takes the largest size any of them asks for.
const wanted = new Map();
for (const [node, prop] of chosen) {
  for (const prim of node.getMesh().listPrimitives()) {
    const material = prim.getMaterial();
    if (!material) continue;
    for (const tex of [
      material.getBaseColorTexture(),
      material.getNormalTexture(),
      material.getMetallicRoughnessTexture(),
      material.getEmissiveTexture(),
      material.getOcclusionTexture(),
    ]) {
      if (!tex) continue;
      wanted.set(tex, Math.max(wanted.get(tex) ?? 0, prop.texture));
    }
  }
}

let shrunk = 0;
for (const [tex, target] of wanted) {
  const [w = 0] = tex.getSize() ?? [];
  if (target >= w) continue;
  const image = tex.getImage();
  if (!image) continue;
  const resized = await sharp(Buffer.from(image))
    .resize(target, target, { fit: "inside" })
    .webp({ quality: 88 })
    .toBuffer();
  tex.setImage(new Uint8Array(resized));
  shrunk += 1;
}
console.log(`downsized ${shrunk} textures below 1024`);

await doc.transform(
  prune(),
  // Meshopt rather than Draco: drei bundles MeshoptDecoder from three-stdlib,
  // while its Draco path fetches a decoder from a Google CDN. meshopt()
  // configures the extension itself, so it must not be re-created here.
  meshopt({ encoder: MeshoptEncoder, level: "high" }),
);

await mkdir("apps/web/public/models", { recursive: true });
await io.write(OUT, doc);

const out = await stat(OUT);
console.log(`\nwrote ${OUT}  ${mb(out.size)}`);
console.log(`triangles: ${Math.round(triangles(doc)).toLocaleString()}`);
console.log(`textures:  ${doc.getRoot().listTextures().length}`);
console.log("\nprops:");
for (const m of manifest) console.log(`  ${m.id.padEnd(16)} ${JSON.stringify(m.size)} m`);
