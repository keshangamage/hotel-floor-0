/**
 * Converts the figure's FBX into a browser-ready GLB.
 *
 * The furniture pipeline rebuilds static meshes by hand, which cannot carry a
 * rig or a clip. This goes through three's exporter instead, so a source that
 * has either keeps it.
 *
 *   node tools/build-figure.mjs ghost.fbx
 */
// The source carries a Cinema 4D camera, and the loader sizes cameras off the
// window. Nothing else here touches the DOM.
globalThis.window ??= { innerWidth: 1920, innerHeight: 1080 };

import { readFileSync, writeFileSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// The exporter finishes by reading a Blob through a FileReader, which node has
// no global for. Everything else it needs is already there.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
};

/**
 * Height in metres.
 *
 * The corridor ceiling is 2.6m. This still looms well over a 1.62m eyeline
 * without touching it.
 */
const HEIGHT = 2.15;

/**
 * Bleached cloth. The source is one flat grey with no UVs anywhere on it, so
 * there is nothing to texture and the shape has to do all the work: the eyes
 * are holes in the sheet rather than something painted on.
 */
const CLOTH = "#b9b4a8";

/** Kept high enough that the folds still read. They are the whole silhouette. */
const SIMPLIFY_RATIO = 0.45;

const OUT = "apps/web/public/models/figure.glb";
const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;
const triangles = (object) => {
  let total = 0;
  object.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    total += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(total);
};

const source = process.argv[2] ?? "ghost.fbx";
const buffer = readFileSync(source);
console.log(`reading ${source} (${mb(buffer.byteLength)})`);

const loaded = new FBXLoader().parse(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  "",
);

// Cameras and lights ship with a scene export and are nothing to do with a prop.
for (const object of [...loaded.children]) {
  if (object.isCamera || object.isLight) object.removeFromParent();
}

const bounds = new THREE.Box3().setFromObject(loaded);
const size = bounds.getSize(new THREE.Vector3());
const centre = bounds.getCenter(new THREE.Vector3());
const scale = HEIGHT / size.y;
console.log(`  source ${size.toArray().map((n) => n.toFixed(1)).join(" x ")}  ${triangles(loaded)} tris  scaling by ${scale.toFixed(4)}`);

// Standing on the origin, centred on it, so the game can place it by its feet.
const root = new THREE.Group();
root.name = "figure";
loaded.scale.setScalar(scale);
loaded.position.set(-centre.x * scale, -bounds.min.y * scale, -centre.z * scale);
root.add(loaded);
root.updateMatrixWorld(true);

// FBX ships Phong, which glTF has no equivalent for.
loaded.traverse((object) => {
  if (!object.isMesh) return;
  object.material = Object.assign(new THREE.MeshStandardMaterial({
    color: new THREE.Color(CLOTH),
    roughness: 0.94,
    metalness: 0,
  }), { name: "Cloth" });
});

const clips = loaded.animations ?? [];
console.log(`  clips ${clips.map((c) => c.name).join(", ") || "none"}`);

const glb = await new Promise((resolve, reject) => {
  new GLTFExporter().parse(root, resolve, reject, {
    binary: true,
    animations: clips,
    onlyVisible: false,
  });
});

await mkdir("apps/web/public/models", { recursive: true });
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": (await import("meshoptimizer")).MeshoptDecoder,
  });

const doc = await io.readBinary(new Uint8Array(glb));
// Safe on this source because nothing in it is skinned. On a rigged one,
// simplify tears the weights off and meshopt's own prune deletes the skin,
// leaving a model that loads, renders and never moves.
await doc.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY_RATIO, error: 0.002 }),
  prune(),
  meshopt({ encoder: MeshoptEncoder }),
);

writeFileSync(OUT, await io.writeBinary(doc));

// Read back what was written rather than trusting the pipeline.
const written = await io.read(OUT);
const out = written.getRoot();
const kept = out.listMeshes()
  .flatMap((m) => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3, 0);
console.log(`wrote ${OUT} (${mb((await stat(OUT)).size)})`);
console.log(`  ${Math.round(kept)} tris  materials ${out.listMaterials().map((m) => m.getName()).join(", ")}`);
if (kept === 0) throw new Error("nothing survived the pipeline");
