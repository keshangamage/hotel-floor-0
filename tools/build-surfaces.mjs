/**
 * Extracts tiling surface textures from the source GLB. These dress the
 * procedural architecture, which is what stops the hotel reading as grey boxes.
 *
 *   node --max-old-space-size=8192 tools/build-surfaces.mjs <source.glb>
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";
import { readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

/** id is what the game imports; material is a prefix of the source name. */
// Walls and carpet fill most of any frame, so they earn more resolution than
// a nightstand does.
const SURFACES = [
  { id: "wall", material: "MI_Moldy_Concrete_Wall", size: 1024 },
  { id: "carpet", material: "SM_Carpet0102", size: 1024 },
  { id: "planks", material: "MI_Dirty_Wooden_Planks" },
  { id: "panel", material: "MI_Worn_Wooden_Wall_Panel" },
  { id: "door", material: "MI_Modular_Wooden_Door", size: 1024 },
  { id: "furniture", material: "MI_Dirty_Wooden_Table" },
  // Upholstery from the armchair. Bedding was using the carpet texture, which
  // put an ornate rug pattern on the duvet and pillows.
  { id: "cloth", material: "cloth", size: 1024 },
  { id: "darkwood", material: "wood" },
  // The artwork itself. Frames and canvases are separate meshes in the source,
  // so a frame extracted alone is literally a hole to look through.
  { id: "canvas-a", material: "fancy_picture_frame_01_canvas" },
  { id: "canvas-b", material: "fancy_picture_frame_02_canvas" },
  { id: "canvas-c", material: "Abendmahl_O_Material" },
];

/** Tiling textures repeat, so most need far less resolution than a hero prop. */
const SIZE = 512;
const OUT = "apps/web/public/textures";

/** Loose texture files from the FBX pack, which has no glTF to read them from. */
const FILE_SURFACES = [
  {
    id: "upholstery",
    dir: "oldfurniturepack_01_fbx (1)/Textures",
    prefix: "T_Couch",
    size: 1024,
  },
];

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
    const px = surface.size ?? SIZE;
    const out = await sharp(Buffer.from(image))
      // Artwork ships with blank margins; trimming makes it fill its quad.
      .trim(isArt ? { threshold: 12 } : { threshold: 100000 })
      .resize(px, px, { fit: "fill" })
      .webp({ quality: 86 })
      .toBuffer();
    await writeFile(`${OUT}/${file}`, out);
    written.push(`${slot} ${px}px ${(out.length / 1024).toFixed(0)}KB`);
  }

  manifest.push({ id: surface.id, slots: written.length, px: surface.size ?? SIZE });
  console.log(`${surface.id.padEnd(12)} ${written.join("  ")}`);
}

for (const surface of FILE_SURFACES) {
  const files = readdirSync(surface.dir);
  const px = surface.size ?? SIZE;
  const written = [];
  for (const [slot, match] of [["color", "diffuse"], ["normal", "normal"], ["orm", "roughness"]]) {
    const file = files.find((f) => f.startsWith(`${surface.prefix}_${match}.`));
    if (!file) continue;
    let pipeline = sharp(`${surface.dir}/${file}`).resize(px, px, { fit: "fill" });
    // The pack ships roughness alone; glTF wants it in the green channel.
    if (slot === "orm") {
      const grey = await pipeline.clone().greyscale().raw().toBuffer();
      const rgb = Buffer.alloc(px * px * 3);
      for (let i = 0; i < px * px; i += 1) {
        rgb[i * 3] = 255;
        rgb[i * 3 + 1] = grey[i];
        rgb[i * 3 + 2] = 0;
      }
      pipeline = sharp(rgb, { raw: { width: px, height: px, channels: 3 } });
    }
    const out = await pipeline.webp({ quality: 86 }).toBuffer();
    await writeFile(`${OUT}/${surface.id}-${slot}.webp`, out);
    written.push(`${slot} ${px}px ${(out.length / 1024).toFixed(0)}KB`);
  }
  manifest.push({ id: surface.id, slots: written.length, px });
  console.log(`${surface.id.padEnd(12)} ${written.join("  ")}`);
}

const vram = manifest.reduce((n, m) => n + m.slots * m.px * m.px * 4 * 1.333, 0);
console.log(`\n${manifest.length} surfaces, ${manifest.reduce((n, m) => n + m.slots, 0)} textures`);
console.log(`estimated VRAM: ${(vram / 1e6).toFixed(0)} MB`);
