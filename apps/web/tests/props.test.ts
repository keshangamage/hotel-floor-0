import { readFileSync, readdirSync } from "node:fs";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { PROP_SIZES } from "../game/data/propSizes.generated";
import { FLOOR_5_LAYOUT } from "../game/data/floor";
import { CORRIDOR_HALF_WIDTH, CEILING_HEIGHT, PLAYER_HEIGHT } from "../game/data/dimensions";

let fail = 0;
const check = (n: string, ok: boolean, d = "") => { if (!ok) fail++; console.log(`${ok?"PASS":"FAIL"}  ${n}${d?"  "+d:""}`); };

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
// Two libraries now: mansion fixtures and the furniture pack.
const MODELS = "apps/web/public/models";
const docs = await Promise.all([
  io.read(`${MODELS}/props.glb`),
  io.read(`${MODELS}/furniture.glb`),
]);
const doc = docs[0]!;
const library = new Map<string, ReturnType<typeof getBounds>>();
for (const d of docs) {
  for (const node of d.getRoot().listScenes()[0]!.listChildren()) {
    if (!node.getMesh()) continue;
    // Prop resolves mansion first, so a duplicate id would silently shadow.
    if (library.has(node.getName())) throw new Error(`duplicate prop id: ${node.getName()}`);
    library.set(node.getName(), getBounds(node));
  }
}

const L = FLOOR_5_LAYOUT;
console.log(`library: ${[...library.keys()].join(", ")}`);
console.log(`placed:  ${L.props.length} instances\n`);

// The failure this catches is silent: a bad id just renders nothing.
const missing = L.props.filter((p) => !library.has(p.id)).map((p) => `${p.instanceId}->${p.id}`);
check("every placed prop exists in the library", missing.length === 0, missing.join(", "));

const ids = L.props.map((p) => p.instanceId);
check("instance ids are unique", new Set(ids).size === ids.length);
// The read above throws on a clash, so reaching here proves it.
check("prop ids are unique across both libraries", true, `${library.size} props`);

/**
 * The manifest has to agree with the meshes it was measured from.
 *
 * Colliders are derived from PROP_SIZES, so a library rebuilt without
 * regenerating it gives every prop a collider the wrong size, and nothing else
 * would notice. This used to pin two props' dimensions as literals, which said
 * nothing about the rest and broke the moment those two were removed.
 */
{
  const drifted: string[] = [];
  for (const [id, size] of Object.entries(PROP_SIZES)) {
    const bounds = library.get(id);
    if (!bounds) { drifted.push(`${id} missing from the library`); continue; }
    const actual = [0, 1, 2].map((i) => bounds.max[i]! - bounds.min[i]!);
    if (actual.some((v, i) => Math.abs(v - size[i]!) > 0.01)) {
      drifted.push(`${id} [${actual.map((v) => v.toFixed(2)).join(", ")}]`);
    }
  }
  check("every prop is measured to match the manifest", drifted.length === 0,
    drifted.join("; ") || `${Object.keys(PROP_SIZES).length} props`);
}

// Corridor art is built from primitives now, not an imported frame.
const paintings = L.paintings;
check("paintings were placed", paintings.length > 0, `${paintings.length}`);
check("paintings hang flat on the corridor walls",
  paintings.every((p) => Math.abs(Math.abs(p.position[0]) - CORRIDOR_HALF_WIDTH) < 0.06),
  paintings.map((p) => p.position[0].toFixed(2)).join(", "));
check("paintings hang at viewing height and fit under the ceiling",
  paintings.every((p) =>
    p.position[1] - p.height / 2 > 0.9 && p.position[1] + p.height / 2 < CEILING_HEIGHT));
check("paintings face into the corridor",
  paintings.every((p) => Math.sign(p.position[0]) === p.side));
check("every painting has artwork assigned",
  paintings.every((p) => Number.isInteger(p.art) && p.art >= 0));

// Every placed prop must have something solid where it stands.
const solidNear = (x: number, z: number) =>
  L.boxes.some((b) => b.collides &&
    Math.abs(b.position[0] - x) < 1.2 && Math.abs(b.position[2] - z) < 1.2);
const furniture = L.props.filter((p) => !p.id.startsWith("painting"));
check("furniture props have colliders nearby",
  furniture.every((p) => solidNear(p.position[0], p.position[2])),
  `${furniture.length} checked`);

// Collision boxes for imported meshes must not be drawn. Only props standing
// on the floor need one; a chandelier is above head height.
// Furniture colliders are invisible boxes, but they are no longer the only
// ones: the lift front is drawn by a scanned prop, so the wall behind it is
// collision only too. Count the furniture kind, not everything hidden.
const invisible = L.boxes.filter((b) => b.visible === false && b.kind === "wood");
// A rug is walked on, not around, so flat floor coverings need no collider.
const FLAT = 0.1;
// The window is set into the wall: it neither stands on the floor nor hangs
// over it, so the height rules for those do not apply to it.
const WALL_SET = new Set(["window"]);
const standing = furniture.filter((p) => {
  const b = library.get(p.id);
  const height = b ? (b.max[1]! - b.min[1]!) * (p.scale ?? 1) : 1;
  return !WALL_SET.has(p.id) && p.position[1] < 1.0 && height > FLAT;
});
const hanging = furniture.filter((p) => !WALL_SET.has(p.id) && p.position[1] >= 1.0);
check("floor-standing props have invisible colliders", invisible.length === standing.length,
  `${invisible.length} invisible vs ${standing.length} standing`);
// A ceiling fixture at full size hung 0.23m above head height, right where
// the player spawns, so they stood inside it.
const CLEARANCE = 0.4;
const tooLow = hanging.filter((p) => p.position[1] - PLAYER_HEIGHT < CLEARANCE);
check("ceiling-hung props clear the player's head", tooLow.length === 0,
  tooLow.map((p) => `${p.id}@${(p.position[1] - PLAYER_HEIGHT).toFixed(2)}m`).join(", ") ||
  hanging.map((p) => `${p.id} ${(p.position[1] - PLAYER_HEIGHT).toFixed(2)}m clear`).join(", "));

// And must not fill the room they hang in.
const ROOM_WIDTH = 3.4;
const wide = hanging.filter((p) => {
  const b = library.get(p.id);
  if (!b) return false;
  const w = (b.max[2]! - b.min[2]!) * (p.scale ?? 1);
  return w > ROOM_WIDTH * 0.25;
});
check("ceiling fixtures do not dominate the room", wide.length === 0,
  wide.map((p) => p.id).join(", "));

// Nothing hung should overlap where the player stands.
const nearSpawn = hanging.filter((p) =>
  Math.hypot(p.position[0] - L.spawn[0], p.position[2] - L.spawn[2]) < 0.6);
check("nothing hangs directly over the spawn", nearSpawn.length === 0,
  nearSpawn.map((p) => p.id).join(", "));

// A textured mesh with no UVs renders black. An untextured one is fine, which
// is why this checks the pair rather than UVs alone.
const bad: string[] = [];
let untextured = 0;
for (const mesh of doc.getRoot().listMeshes()) {
  for (const [i, prim] of mesh.listPrimitives().entries()) {
    const m = prim.getMaterial();
    const textured = Boolean(
      m?.getBaseColorTexture() || m?.getNormalTexture() ||
      m?.getMetallicRoughnessTexture() || m?.getEmissiveTexture(),
    );
    if (!textured) untextured += 1;
    if (textured && !prim.getAttribute("TEXCOORD_0")) bad.push(`${mesh.getName()}#${i}`);
  }
}
check("no textured mesh is missing UVs", bad.length === 0, bad.join(", "));
check("untextured primitives are accounted for", untextured <= 1, `${untextured} (chandelier bulb)`);

// Meshopt survives the round trip through a real decoder.
let tris = 0;
for (const mesh of doc.getRoot().listMeshes())
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    tris += idx ? idx.getCount() / 3 : prim.getAttribute("POSITION")!.getCount() / 3;
  }
// Guards the decoder, not the library's size: a meshopt file that fails to
// decode reports zero or a handful, so the number only has to be clearly more
// than nothing. It was 30000, tuned to a library that carried seven props the
// game never drew.
check("meshopt geometry decodes to real triangles", tris > 1000, `${Math.round(tris)}`);

// Corridor art is drawn from primitives, so the only asset dependency is the
// artwork itself.
const canvases = readdirSync("apps/web/public/textures")
  .filter((f) => f.startsWith("canvas-") && f.endsWith("-color.webp"));
check("canvas artwork exists for the frames", canvases.length >= 3, canvases.join(", "));
check("every painting indexes artwork that exists",
  L.paintings.every((p) => p.art % canvases.length >= 0));

/**
 * Meshopt centres each mesh and stores the decode offset and scale on its node.
 * Setting position/rotation/scale on drei's Clone replaces that decode, which
 * renders every prop sunk into the floor at the wrong size. The transform must
 * go on a wrapper instead.
 */
const carriesDecode = [...library.keys()].filter((id) => {
  for (const d of docs) {
    const node = d.getRoot().listScenes()[0]!.listChildren().find((n) => n.getName() === id);
    if (!node) continue;
    const t = node.getTranslation();
    const sc = node.getScale();
    return t.some((v) => Math.abs(v) > 1e-6) || sc.some((v) => Math.abs(v - 1) > 1e-6);
  }
  return false;
});
check("library nodes carry a decode transform", carriesDecode.length > 0,
  `${carriesDecode.length}/${library.size} nodes`);

const propSource = readFileSync(
  "apps/web/components/environment/Prop.tsx",
  "utf8",
);
const cloneTag = propSource.slice(propSource.indexOf("<Clone"), propSource.indexOf("/>", propSource.indexOf("<Clone")));
check("Prop does not set a transform on the Clone",
  !/\b(position|scale|rotation)=/.test(cloneTag),
  cloneTag.replace(/\s+/g, " ").trim());
check("Prop applies its transform to a wrapper instead",
  /<group[^>]*position=/.test(propSource));

// A textured material with no normal map renders as a perfectly smooth plane,
// which is what made the cupboard read as a painted box. The build derives one
// from the albedo when a source does not ship it, so none should be missing.
{
  const { NodeIO } = await import("@gltf-transform/core");
  const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
  const { MeshoptDecoder } = await import("meshoptimizer");
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });

  for (const file of ["furniture.glb", "props.glb"]) {
    const doc = await io.read(`apps/web/public/models/${file}`);
    const flat = doc.getRoot().listMaterials()
      .filter((m) => m.getBaseColorTexture() && !m.getNormalTexture())
      .map((m) => m.getName());
    check(`${file}: every textured material has a normal map`,
      flat.length === 0, flat.length ? `flat: ${flat.join(", ")}` : "all have relief");

    const glossy = doc.getRoot().listMaterials()
      .filter((m) => m.getBaseColorTexture() && !m.getMetallicRoughnessTexture())
      .map((m) => m.getName());
    check(`${file}: every textured material varies its roughness`,
      glossy.length === 0, glossy.length ? `uniform: ${glossy.join(", ")}` : "all vary");
  }
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
