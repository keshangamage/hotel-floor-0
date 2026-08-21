import * as THREE from "three";

import { LAMP_COLOR } from "@/game/data/atmosphere";
import type { SurfaceKind, Vec3 } from "@/game/types";

/** Metres covered by one repeat of a tiling texture. */
const TILE = 1.7;

/** Small fixed-size meshes (fixtures, buttons, doors) still scale a unit cube. */
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

const loader = new THREE.TextureLoader();
const surfaces = new Map<string, ReturnType<typeof loadSurface>>();

function loadSurface(id: string) {
  const color = loader.load(`/textures/${id}-color.webp`);
  const normal = loader.load(`/textures/${id}-normal.webp`);
  const orm = loader.load(`/textures/${id}-orm.webp`);
  color.colorSpace = THREE.SRGBColorSpace;
  for (const map of [color, normal, orm]) {
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
  }
  return { color, normal, orm };
}

/** Shared between materials, so two surfaces using one texture cost it once. */
function surface(id: string) {
  const existing = surfaces.get(id);
  if (existing) return existing;
  const loaded = loadSurface(id);
  surfaces.set(id, loaded);
  return loaded;
}

function textured(id: string, tint: string, roughness = 1) {
  const { color, normal, orm } = surface(id);
  return new THREE.MeshStandardMaterial({
    map: color,
    normalMap: normal,
    // glTF packs roughness in green and metalness in blue of one texture.
    roughnessMap: orm,
    metalnessMap: orm,
    color: tint,
    roughness,
    metalness: 1,
  });
}

const plain = (color: string, roughness: number, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

export const MATERIALS: Record<SurfaceKind, THREE.MeshStandardMaterial> = {
  wall: textured("wall", "#8d8577"),
  // Hotels are carpeted, and it hides the seams between boxes.
  floor: textured("carpet", "#6f5d52"),
  // Same texture as the walls, tinted paler, so it costs no extra VRAM.
  ceiling: textured("wall", "#9a958a"),
  door: textured("door", "#c4ab86"),
  trim: textured("panel", "#9b8b72"),
  wood: textured("furniture", "#9a8874"),
  fabric: textured("carpet", "#8c8375"),
  metal: plain("#4a4e55", 0.45, 0.55),
  glass: new THREE.MeshStandardMaterial({
    color: "#10151f",
    // A night window should glow faintly, not read as a hole in the wall.
    emissive: new THREE.Color("#2b3b57"),
    emissiveIntensity: 0.7,
    roughness: 0.15,
    transparent: true,
    opacity: 0.55,
  }),
};

/** Nothing can sit between a slab and a ceiling lamp, so slabs never cast. */
export const CASTS_SHADOW: Record<SurfaceKind, boolean> = {
  wall: true,
  floor: false,
  ceiling: false,
  door: true,
  trim: true,
  metal: true,
  wood: true,
  fabric: true,
  glass: false,
};

/**
 * BoxGeometry gives every face 0..1 UVs, so a shared texture would stretch to
 * fit a wall of any length. Scaling the UVs per face by that face's real size
 * makes one texture tile consistently across the whole hotel.
 *
 * Cached by size: the corridor reuses a handful of distinct boxes.
 */
const geometries = new Map<string, THREE.BoxGeometry>();

export function geometryFor(size: Vec3): THREE.BoxGeometry {
  const key = `${size[0].toFixed(3)}|${size[1].toFixed(3)}|${size[2].toFixed(3)}`;
  const cached = geometries.get(key);
  if (cached) return cached;

  const [w, h, d] = size;
  const geometry = new THREE.BoxGeometry(w, h, d);
  const uv = geometry.getAttribute("uv");

  // Face order is +X, -X, +Y, -Y, +Z, -Z, four vertices each.
  const perFace: [number, number][] = [
    [d / TILE, h / TILE],
    [d / TILE, h / TILE],
    [w / TILE, d / TILE],
    [w / TILE, d / TILE],
    [w / TILE, h / TILE],
    [w / TILE, h / TILE],
  ];
  for (let face = 0; face < 6; face += 1) {
    const [su, sv] = perFace[face]!;
    for (let corner = 0; corner < 4; corner += 1) {
      const i = face * 4 + corner;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;

  geometries.set(key, geometry);
  return geometry;
}

/** Artwork for picture frames, which ship from the source as empty surrounds. */
export const CANVAS_MATERIALS = ["canvas-a", "canvas-b", "canvas-c"].map((id) => {
  const { color } = surface(id);
  // Canvases are flat art, not tiling surfaces.
  color.wrapS = THREE.ClampToEdgeWrapping;
  color.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.MeshStandardMaterial({ map: color, roughness: 0.85, color: "#b9a98c" });
});

export const FIXTURE_MATERIAL = plain("#1a1a1c", 0.55, 0.4);

/** A burnt-out fixture: same housing, no glow. */
export const DEAD_PANEL_MATERIAL = plain("#141310", 0.95);

/** The visible source. Emissive so the fixture reads as lit, not just lit-by. */
export const LAMP_PANEL_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#000000",
  emissive: new THREE.Color(LAMP_COLOR),
  emissiveIntensity: 2.5,
  roughness: 1,
});
