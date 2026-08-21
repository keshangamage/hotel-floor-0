/**
 * Extracts tiling surface textures from the source GLB. These dress the
 * procedural architecture, which is what stops the hotel reading as grey boxes.
 *
 *   node --max-old-space-size=8192 tools/build-surfaces.mjs <source.glb>
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

/** id is what the game imports; material is a prefix of the source name. */
const SURFACES = [
  { id: "wall", material: "MI_Moldy_Concrete_Wall" },
  { id: "carpet", material: "SM_Carpet0102" },
  { id: "planks", material: "MI_Dirty_Wooden_Planks" },
  { id: "panel", material: "MI_Worn_Wooden_Wall_Panel" },
  { id: "door", material: "MI_Modular_Wooden_Door" },
  { id: "furniture", material: "MI_Dirty_Wooden_Table" },
  // The artwork itself. Frames and canvases are separate meshes in the source,
  // so a frame extracted alone is literally a hole to look through.
  { id: "canvas-a", material: "fancy_picture_frame_01_canvas" },
  { id: "canvas-b", material: "fancy_picture_frame_02_canvas" },
  { id: "canvas-c", material: "Abendmahl_O_Material" },
];

/** Tiling textures repeat, so they need far less resolution than a hero prop. */
const SIZE = 512;
const OUT = "apps/web/public/textures";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const materials = doc.getRoot().listMaterials();

await mkdir(OUT, { recursive: true });
const manifest = [];

for (const surface of SURFACES) {
  const material = materials.find((m) => m.getName().startsWith(surface.material));
  if (!material) {
    console.error(`  MISSING  ${surface.id}: no material "${surface.material}"`);
    continue;
  }

  const slots = [
    ["color", material.getBaseColorTexture()],
    ["normal", material.getNormalTexture()],
    ["orm", material.getMetallicRoughnessTexture()],
  ];

  const written = [];
  for (const [slot, texture] of slots) {
    const image = texture?.getImage();
    if (!image) continue;
    const file = `${surface.id}-${slot}.webp`;
    const isArt = surface.id.startsWith("canvas-");
    const out = await sharp(Buffer.from(image))
      // Artwork ships with blank margins; trimming makes it fill its quad.
      .trim(isArt ? { threshold: 12 } : { threshold: 100000 })
      .resize(SIZE, SIZE, { fit: "fill" })
      .webp({ quality: 86 })
      .toBuffer();
    await writeFile(`${OUT}/${file}`, out);
    written.push(`${slot} ${(out.length / 1024).toFixed(0)}KB`);
  }

  manifest.push({ id: surface.id, slots: written.length });
  console.log(`${surface.id.padEnd(12)} ${written.join("  ")}`);
}

const vram = manifest.reduce((n, m) => n + m.slots * SIZE * SIZE * 4 * 1.333, 0);
console.log(`\n${manifest.length} surfaces, ${manifest.reduce((n, m) => n + m.slots, 0)} textures`);
console.log(`estimated VRAM: ${(vram / 1e6).toFixed(0)} MB`);
