/**
 * Renders a GLB to a PNG offline, so an asset can be looked at without a
 * browser, a GPU or a running game.
 *
 * Written to settle which way the figure was facing, after two wrong guesses
 * read off vertex bounds. A model's front is not something to infer from
 * numbers when it can simply be looked at.
 *
 *   node tools/preview-asset.mjs apps/web/public/models/figure.glb out.png [--back]
 */
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";

const [source, out = "preview.png"] = process.argv.slice(2);
if (!source) throw new Error("usage: node tools/preview-asset.mjs <model.glb> [out.png] [--back]");
const front = !process.argv.includes("--back");
const buf = readFileSync(source);
await MeshoptDecoder.ready;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltf = await new Promise((res, rej) =>
  loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength), "", res, rej));
const scene = gltf.scene;
scene.updateMatrixWorld(true);

const W = 320, H = 520;
const LIGHT = new THREE.Vector3(-0.45, 0.55, 0.7).normalize();
const tris = [];
scene.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry, pos = g.attributes.position;
  const idx = g.index ? g.index.array : null;
  const n = idx ? idx.length : pos.count;
  const col = o.material.color ?? new THREE.Color(1,1,1);
  for (let i = 0; i < n; i += 3) {
    const a = idx ? idx[i] : i, b = idx ? idx[i+1] : i+1, c = idx ? idx[i+2] : i+2;
    const v = [a,b,c].map(j => new THREE.Vector3().fromBufferAttribute(pos, j).applyMatrix4(o.matrixWorld));
    tris.push({ v, col });
  }
});

function render(fromFront, file) {
  const zb = new Float32Array(W*H).fill(-Infinity);
  const px = new Uint8Array(W*H*3);
  const s = fromFront ? 1 : -1;
  for (const { v, col } of tris) {
    const p = v.map(q => ({
      x: W/2 + s*q.x * (H/2.6),           // fit 2.6m of height
      y: H - (q.y) * (H/2.6) - 20,
      z: s*q.z,
    }));
    const nx = new THREE.Vector3().subVectors(v[1],v[0]).cross(new THREE.Vector3().subVectors(v[2],v[0])).normalize();
    // Lit from off to one side rather than from the camera. A headlight makes
    // every recess the same brightness as the surface around it, which hides
    // exactly the features worth checking.
    const light = Math.max(0.08, nx.dot(LIGHT) * 0.85 + 0.12);
    const minX = Math.max(0, Math.floor(Math.min(...p.map(q=>q.x)))), maxX = Math.min(W-1, Math.ceil(Math.max(...p.map(q=>q.x))));
    const minY = Math.max(0, Math.floor(Math.min(...p.map(q=>q.y)))), maxY = Math.min(H-1, Math.ceil(Math.max(...p.map(q=>q.y))));
    const d = (a,b,c) => (b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x);
    const area = d(p[0],p[1],p[2]); if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const q = {x:x+0.5,y:y+0.5};
      const w0 = d(p[1],p[2],q)/area, w1 = d(p[2],p[0],q)/area, w2 = d(p[0],p[1],q)/area;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0*p[0].z + w1*p[1].z + w2*p[2].z;
      const i = y*W+x;
      if (z <= zb[i]) continue;
      zb[i] = z;
      px[i*3]   = Math.min(255, col.r*255*light);
      px[i*3+1] = Math.min(255, col.g*255*light);
      px[i*3+2] = Math.min(255, col.b*255*light);
    }
  }
  return sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 3 } }).png().toFile(file);
}
await render(front, out);
console.log(`${tris.length} triangles -> ${out} (${front ? "+Z" : "-Z"})`);
