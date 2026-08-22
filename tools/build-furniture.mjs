/**
 * Converts the FBX furniture pack into an optimised glTF prop library.
 *
 * FBX has no browser-friendly runtime, so this parses it offline with three's
 * FBXLoader, rebuilds the chosen meshes as a glTF document, packs the pack's
 * separate roughness/metallic maps into the ORM layout glTF expects, and runs
 * the same decimation and compression as the mansion pipeline.
 *
 *   node --max-old-space-size=8192 tools/build-furniture.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { Document, NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup, flatten, mergeDocuments, meshopt, prune, simplifyPrimitive, textureCompress,
  transformMesh, weld,
} from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

/**
 * Every folder in the repo root holding an .fbx is treated as a pack, so a new
 * one only needs dropping in. Run with --list to print what it contains.
 */
function discoverPacks() {
  return readdirSync(".", { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((dir) => {
      try {
        return readdirSync(dir).some((f) => f.toLowerCase().endsWith(".fbx"));
      } catch {
        return false;
      }
    });
}

const LIST_ONLY = process.argv.includes("--list");

/** Loose glTF sources. The mansion has its own pipeline. */
const HANDLED_ELSEWHERE = new Set(["Old Horror Mansion Hall GLB.glb"]);
const glbSources = readdirSync(".").filter(
  (f) => f.toLowerCase().endsWith(".glb") && !HANDLED_ELSEWHERE.has(f),
);

/**
 * Multi-part pieces are recentred as a group. Recentring each mesh on its own
 * would collapse a bed's frame, mattress and blanket onto the same origin.
 */
const GLB_PICKS = [
  {
    id: "bed",
    file: "old_hospital_bed_pbrgr.glb",
    // Blanket omitted on purpose: it drapes to 16cm and hides the frame's
    // 50cm legs, so the bed reads as sitting on the floor. A bare mattress on
    // an exposed iron frame also suits an abandoned hotel better.
    // Add "blanket_blanket_0" back to restore it.
    meshes: ["bed_bed_0", "mattress_mattress_0"],
    toMetres: 0.01,
  },
];
const OUT = "apps/web/public/models/furniture.glb";
/** The pack authors in centimetres. */
const TO_METRES = 0.01;
const TEXTURE_SIZE = 1024;

/** id is what the game asks for; mesh is the FBX node name. */
const PICKS = [
  { id: "rug", mesh: "Carpet_01", ratio: 1 },
  { id: "desk", mesh: "Table_01", ratio: 0.4 },
  { id: "chair", mesh: "Chair_02", ratio: 0.7 },
  { id: "dresser", mesh: "WoodenShelf_02", ratio: 1 },
  { id: "wardrobe", mesh: "WoodenShelf_03", ratio: 1 },
  { id: "couch", mesh: "Couch", ratio: 0.35 },
];

/** FBX material name to the pack's texture file prefix. */
const TEXTURE_SET = {
  Carpet: "T_Carpet_01",
  TableAndChair_01: "T_TableAndChair_01",
  TableAndChair_02: "T_TableAndChair_02",
  Couch: "T_Couch",
  WoodenShelf_01: "T_WoodenShelf_01",
  WoodenShelf_02: "T_WoodenShelf_02",
  WoodenShelf_03: "T_WoodenShelf_03",
  WoodenShelf_04: "T_WoodenShelf_04",
  CabinetParts: "T_CabinetParts",
};

// FBXLoader resolves textures through browser image APIs. Stub them: the
// geometry is what matters here, and textures are mapped by name below.
class StubImage extends EventTarget {
  constructor() { super(); this.width = 1; this.height = 1; }
  set src(_v) { queueMicrotask(() => this.dispatchEvent(new Event("load"))); }
}
globalThis.Image = StubImage;
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
globalThis.document = globalThis.document ?? {
  createElementNS: () => new StubImage(),
  createElement: () => new StubImage(),
};

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const packs = discoverPacks();
if (packs.length === 0) {
  console.error("no pack folders found: drop a folder containing an .fbx in the repo root");
  process.exit(1);
}

const meshes = new Map();
const textureDirs = [];
for (const dir of packs) {
  const entries = readdirSync(dir);
  const fbxName = entries.find((f) => f.toLowerCase().endsWith(".fbx"));
  const textures = entries.find((f) => f.toLowerCase() === "textures");
  if (textures) textureDirs.push(`${dir}/${textures}`);

  const fbx = readFileSync(`${dir}/${fbxName}`);
  const root = new FBXLoader().parse(
    fbx.buffer.slice(fbx.byteOffset, fbx.byteOffset + fbx.byteLength),
    "",
  );
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (meshes.has(o.name)) console.warn(`  duplicate mesh name across packs: ${o.name}`);
    meshes.set(o.name, o);
  });
  console.log(`read ${dir}/${fbxName}`);
}

const files = textureDirs.flatMap((d) => readdirSync(d).map((f) => `${d}/${f}`));
const findTexture = (prefix, slot) => {
  const hit = files.find((f) => f.split("/").pop().startsWith(`${prefix}_${slot}.`));
  return hit ?? null;
};

if (LIST_ONLY) {
  console.log(`\n${"mesh".padEnd(22)} ${"size (m)".padEnd(22)} material`);
  for (const [name, o] of [...meshes].sort((a, b) => a[0].localeCompare(b[0]))) {
    const box = new THREE.Box3().setFromObject(o);
    const size = new THREE.Vector3(); box.getSize(size);
    const mat = (Array.isArray(o.material) ? o.material[0] : o.material)?.name ?? "?";
    console.log(
      `${name.slice(0, 21).padEnd(22)} ` +
      `${[size.x, size.y, size.z].map((v) => (v * TO_METRES).toFixed(2)).join(" x ").padEnd(22)} ${mat}`,
    );
  }
  console.log(`\n${meshes.size} meshes across ${packs.length} pack(s).`);
  console.log("Add the ones you want to PICKS in this file, then run without --list.");
  process.exit(0);
}

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene();
const materials = new Map();

/** glTF wants occlusion, roughness and metalness packed into one RGB texture. */
async function ormTexture(prefix) {
  const px = TEXTURE_SIZE;
  const grey = async (slot, fallback) => {
    const file = findTexture(prefix, slot);
    if (!file) return Buffer.alloc(px * px, fallback);
    return sharp(file).resize(px, px, { fit: "fill" }).greyscale().raw().toBuffer();
  };
  const [rough, metal] = await Promise.all([grey("roughness", 200), grey("metallic", 0)]);
  const rgb = Buffer.alloc(px * px * 3);
  for (let i = 0; i < px * px; i += 1) {
    rgb[i * 3] = 255;              // occlusion: unused
    rgb[i * 3 + 1] = rough[i];     // roughness
    rgb[i * 3 + 2] = metal[i];     // metalness
  }
  return sharp(rgb, { raw: { width: px, height: px, channels: 3 } })
    .webp({ quality: 86 })
    .toBuffer();
}

async function materialFor(name) {
  const cached = materials.get(name);
  if (cached) return cached;

  const prefix = TEXTURE_SET[name];
  const material = doc.createMaterial(name).setRoughnessFactor(1).setMetallicFactor(1);
  if (prefix) {
    const colourFile = findTexture(prefix, "diffuse");
    if (colourFile) {
      const image = await sharp(colourFile)
        .resize(TEXTURE_SIZE, TEXTURE_SIZE, { fit: "fill" }).webp({ quality: 86 }).toBuffer();
      material.setBaseColorTexture(
        doc.createTexture(`${name}-color`).setImage(new Uint8Array(image)).setMimeType("image/webp"),
      );
    }
    const normalFile = findTexture(prefix, "normal");
    if (normalFile) {
      const image = await sharp(normalFile)
        .resize(TEXTURE_SIZE, TEXTURE_SIZE, { fit: "fill" }).webp({ quality: 86 }).toBuffer();
      material.setNormalTexture(
        doc.createTexture(`${name}-normal`).setImage(new Uint8Array(image)).setMimeType("image/webp"),
      );
    }
    const orm = await ormTexture(prefix);
    material.setMetallicRoughnessTexture(
      doc.createTexture(`${name}-orm`).setImage(new Uint8Array(orm)).setMimeType("image/webp"),
    );
  }
  materials.set(name, material);
  return material;
}

const manifest = [];
for (const pick of PICKS) {
  const source = meshes.get(pick.mesh);
  if (!source) {
    console.error(`  MISSING  ${pick.id}: no mesh named "${pick.mesh}"`);
    continue;
  }

  // Bake the world transform and convert to metres, then sit the piece at the
  // origin with its base on the floor, matching the mansion library.
  const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld).scale(TO_METRES, TO_METRES, TO_METRES);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  if (!geometry.index) geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
  if (!geometry.attributes.normal) geometry.computeVertexNormals();

  const attr = (name, type) =>
    doc.createAccessor(`${pick.id}-${name}`)
      .setType(type)
      .setArray(Float32Array.from(geometry.attributes[name === "POSITION" ? "position" : name === "NORMAL" ? "normal" : "uv"].array))
      .setBuffer(buffer);

  const primitive = doc.createPrimitive()
    .setAttribute("POSITION", attr("POSITION", "VEC3"))
    .setAttribute("NORMAL", attr("NORMAL", "VEC3"))
    .setIndices(
      doc.createAccessor(`${pick.id}-idx`).setType("SCALAR")
        .setArray(Uint32Array.from(geometry.index.array)).setBuffer(buffer),
    );
  if (geometry.attributes.uv) primitive.setAttribute("TEXCOORD_0", attr("TEXCOORD_0", "VEC2"));

  const materialName = (Array.isArray(source.material) ? source.material[0] : source.material)?.name ?? "";
  primitive.setMaterial(await materialFor(materialName));

  const mesh = doc.createMesh(pick.id).addPrimitive(primitive);
  scene.addChild(doc.createNode(pick.id).setMesh(mesh));

  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox.getSize(size);
  manifest.push({ id: pick.id, size: [size.x, size.y, size.z], ratio: pick.ratio });
}

// Loose glTF sources merge straight in; only the scale and origin differ.
for (const pick of GLB_PICKS) {
  if (!glbSources.includes(pick.file)) {
    console.error(`  MISSING  ${pick.id}: ${pick.file} not found`);
    continue;
  }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const source = await io.read(pick.file);
  await source.transform(flatten());
  mergeDocuments(doc, source);

  const nodes = doc.getRoot().listNodes().filter((n) => pick.meshes.includes(n.getName()));
  if (nodes.length !== pick.meshes.length) {
    console.error(`  ${pick.id}: expected ${pick.meshes.length} meshes, found ${nodes.length}`);
  }

  // Bake each part's own transform, converting to metres.
  for (const node of nodes) {
    const m = [...node.getWorldMatrix()];
    for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14]) m[i] *= pick.toMetres;
    transformMesh(node.getMesh(), m);
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }

  // Then recentre the whole group together, base on the floor.
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const node of nodes) {
    const b = getBounds(node);
    for (const i of [0, 1, 2]) {
      box.min[i] = Math.min(box.min[i], b.min[i]);
      box.max[i] = Math.max(box.max[i], b.max[i]);
    }
  }
  const shift = [-(box.min[0] + box.max[0]) / 2, -box.min[1], -(box.min[2] + box.max[2]) / 2];
  const combined = doc.createMesh(pick.id);
  for (const node of nodes) {
    transformMesh(node.getMesh(), [1,0,0,0, 0,1,0,0, 0,0,1,0, shift[0], shift[1], shift[2], 1]);
    for (const prim of node.getMesh().listPrimitives()) combined.addPrimitive(prim);
    node.dispose();
  }
  scene.addChild(doc.createNode(pick.id).setMesh(combined));
  manifest.push({
    id: pick.id,
    size: [0, 1, 2].map((i) => box.max[i] - box.min[i]),
    ratio: 1,
  });
  console.log(`merged ${pick.id} from ${pick.file}`);
}

// Drop the merged source scenes so only our own survives.
for (const other of doc.getRoot().listScenes()) {
  if (other !== scene) other.dispose();
}

const triangles = () =>
  doc.getRoot().listMeshes().reduce((n, m) =>
    n + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);

console.log(`converted ${manifest.length} pieces, ${Math.round(triangles()).toLocaleString()} triangles`);

await doc.transform(prune(), dedup(), weld());
for (const pick of PICKS) {
  if (pick.ratio >= 1) continue;
  const node = doc.getRoot().listNodes().find((n) => n.getName() === pick.id);
  if (!node) continue;
  for (const prim of node.getMesh().listPrimitives()) {
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: pick.ratio, error: 0.006 });
  }
}
console.log(`decimated to ${Math.round(triangles()).toLocaleString()} triangles`);

await doc.transform(
  prune(),
  // Merged sources arrive at their own resolution; the FBX path already
  // resized, so this only bites on the glTF ones.
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 86 }),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: "high" }),
);

// Merging brings its own buffer, and a GLB may only have one.
for (const accessor of doc.getRoot().listAccessors()) accessor.setBuffer(buffer);
for (const other of doc.getRoot().listBuffers()) {
  if (other !== buffer) other.dispose();
}

await mkdir("apps/web/public/models", { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
await io.write(OUT, doc);

console.log(`\nwrote ${OUT}  ${((await stat(OUT)).size / 1e6).toFixed(2)} MB`);
console.log(`textures: ${doc.getRoot().listTextures().length}`);
console.log("\npieces (metres):");
for (const m of manifest) {
  console.log(`  ${m.id.padEnd(10)} ${m.size.map((v) => v.toFixed(2)).join(" x ")}`);
}
