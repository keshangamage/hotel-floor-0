/**
 * Converts the figure's FBX into a browser-ready GLB, rig and animation intact.
 *
 * The furniture pipeline rebuilds static meshes by hand, which cannot carry a
 * skin or a clip. This goes through three's exporter instead so the bones and
 * the idle survive, then compresses the result.
 *
 *   node tools/build-figure.mjs big_ghost_lite.fbx
 */
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, resample } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
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
 * The corridor ceiling is 2.6m. The source stands 2.5m, which leaves it no
 * room to move: its idle drifts up and down, and at full size that puts its
 * head through the ceiling. This still looms over a 1.62m eyeline.
 */
const HEIGHT = 2.15;

/**
 * The look, which the download does not carry.
 *
 * The LITE version is geometry and UVs with no maps at all: no embedded
 * textures, no external references. The dark cloth, the teal hat and the two
 * eyes on the store page are painted on, so they are rebuilt here as materials
 * and a little geometry rather than left as the flat grey the file ships.
 */
const CLOTH = "#332a24";
const EYE = "#efe9dc";

/** How far up the figure the face sits, as a fraction of its height. */
const EYE_FRACTION = 0.873;
const EYE_SPREAD = 0.07;
const EYE_RADIUS = 0.028;
const OUT = "apps/web/public/models/figure.glb";
const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;

const source = process.argv[2] ?? "big_ghost_lite.fbx";
const buffer = readFileSync(source);
console.log(`reading ${source} (${mb(buffer.byteLength)})`);

const loaded = new FBXLoader().parse(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  "",
);

// The hat goes: a separate mesh hanging off the top joint, which none of the
// clips touch. Dropped before anything is measured, so HEIGHT stays the height
// of what actually ships rather than of something that is no longer on it.
loaded.getObjectByName("Hat")?.removeFromParent();

// Measured in the bind pose, before anything is moved.
const bounds = new THREE.Box3().setFromObject(loaded);
const size = bounds.getSize(new THREE.Vector3());
const centre = bounds.getCenter(new THREE.Vector3());
const scale = HEIGHT / size.y;
console.log(`  source ${size.toArray().map((n) => n.toFixed(2)).join(" x ")}  scaling by ${scale.toFixed(3)}`);

// Standing on the origin, centred on it, so the game can place it by its feet.
const root = new THREE.Group();
root.name = "figure";
loaded.scale.setScalar(scale);
loaded.position.set(-centre.x * scale, -bounds.min.y * scale, -centre.z * scale);
root.add(loaded);
root.updateMatrixWorld(true);

// FBX ships Lambert, which glTF has no equivalent for, and both of these are
// the same flat grey. Converted and coloured here so the model is a well
// formed PBR asset that already looks like itself.
loaded.traverse((object) => {
  if (!object.isMesh) return;
  object.material = Object.assign(new THREE.MeshStandardMaterial({
    color: new THREE.Color(CLOTH),
    roughness: 0.97,
    metalness: 0,
  }), { name: "Cloth" });
});

// Two eyes, hung off the top joint now that the hat they were pinned to is
// gone. It has to be the joint rather than the root: the idle moves the whole
// chain, and anything left behind would hang in the air while the head drifted
// out from under it.
const head = loaded.getObjectByName("Joint5");
const body = loaded.getObjectByName("Ghost");
if (!head || !body) throw new Error("no head or body to put a face on");
root.updateMatrixWorld(true);

// Where the front of the face actually is, sampled off the mesh. Carrying a
// number over from a previous scale is how eyes end up inside a head.
const eyeY = HEIGHT * EYE_FRACTION;
const vertex = new THREE.Vector3();
const positions = body.geometry.attributes.position;
let front = -Infinity;
for (let i = 0; i < positions.count; i += 1) {
  vertex.fromBufferAttribute(positions, i).applyMatrix4(body.matrixWorld);
  if (Math.abs(vertex.y - eyeY) < 0.04) front = Math.max(front, vertex.z);
}
if (!Number.isFinite(front)) throw new Error(`no face found at ${eyeY.toFixed(2)}m`);
console.log(`  face at y=${eyeY.toFixed(2)} z=${front.toFixed(3)}`);

const headScale = new THREE.Vector3();
head.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), headScale);
const eyeGeometry = new THREE.SphereGeometry(1, 14, 12);
const eyeMaterial = Object.assign(new THREE.MeshStandardMaterial({
  color: new THREE.Color(EYE),
  roughness: 0.4,
  // Barely lit rather than glowing: findable in a corridor with one lamp in
  // it, without turning into headlights.
  emissive: new THREE.Color(EYE),
  emissiveIntensity: 0.35,
}), { name: "Eye" });
for (const side of [-1, 1]) {
  const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  eye.name = side < 0 ? "EyeLeft" : "EyeRight";
  eye.position.copy(head.worldToLocal(
    new THREE.Vector3(side * EYE_SPREAD, eyeY, front + EYE_RADIUS * 0.55),
  ));
  // Uniform, so the joint's own rotation cannot shear them.
  eye.scale.setScalar(EYE_RADIUS / headScale.x);
  head.add(eye);
}
root.updateMatrixWorld(true);

const clips = loaded.animations;
console.log(`  clips ${clips.map((c) => `${c.name} (${c.duration.toFixed(1)}s)`).join(", ") || "none"}`);

const glb = await new Promise((resolve, reject) => {
  new GLTFExporter().parse(
    root,
    resolve,
    reject,
    // Bones move every frame, so nothing here can be baked into the vertices.
    { binary: true, animations: clips, onlyVisible: false },
  );
});

await mkdir("apps/web/public/models", { recursive: true });
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });

await MeshoptEncoder.ready;
const doc = await io.readBinary(new Uint8Array(glb));
// Deduplication only. Simplifying tears the weights off a skinned mesh, and
// meshopt() runs a prune that reads the skin as unreferenced and deletes the
// rig outright: the model still loads and renders, and simply never moves.
// Two and a half thousand triangles do not need compressing anyway.
// Resampling is where the size is: the exporter writes a key per bone per
// frame, and an idle that drifts holds still on most of them.
await doc.transform(dedup(), resample());

writeFileSync(OUT, await io.writeBinary(doc));

// Read back what was actually written. A GLB that has lost its skin still
// loads, still renders, and simply never moves, which is not something the
// game would report.
const written = await io.read(OUT);
const out = written.getRoot();
const skins = out.listSkins().length;
const animations = out.listAnimations().map((a) => a.getName());
console.log(`wrote ${OUT} (${mb((await stat(OUT)).size)})`);
console.log(`  meshes ${out.listMeshes().length}  skins ${skins}  clips ${animations.join(", ") || "none"}`);
if (skins === 0) throw new Error("the rig did not survive: the figure would never move");
if (animations.length !== clips.length) {
  throw new Error(`expected ${clips.length} clips, wrote ${animations.length}`);
}
