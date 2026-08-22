import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { LAMP_COLOR } from "@/game/data/atmosphere";
import type { SurfaceKind, Vec3 } from "@/game/types";

/** Metres covered by one repeat of a tiling texture. */
const TILE = 1.7;

/**
 * Per-surface override. A 1.7m repeat suits a wall and is absurd on a duvet,
 * where it puts barely one pattern across the whole bed.
 */
const TILE_BY_KIND: Partial<Record<SurfaceKind, number>> = {
  linen: 0.55,
  fabric: 0.55,
  wood: 0.9,
  metal: 0.5,
};

const tileFor = (kind?: SurfaceKind) => (kind && TILE_BY_KIND[kind]) || TILE;

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

function textured(id: string, tint: string, roughness = 1, relief = 1) {
  const { color, normal, orm } = surface(id);
  return new THREE.MeshStandardMaterial({
    // Deeper relief gives ambient occlusion and grazing light something to
    // catch, which is most of what stops a flat plane reading as cardboard.
    normalScale: new THREE.Vector2(relief, relief),
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
  wood: textured("darkwood", "#8a7358"),
  fabric: textured("upholstery", "#7b7160", 1),
  // Bedding and curtains. Flat on purpose: a tiled pattern at duvet scale
  // reads as noise, and plain cloth cannot produce a UV artifact.
  linen: plain("#c9bda4", 0.97),
  metal: plain("#3f434a", 0.58, 0.45),
  glass: new THREE.MeshStandardMaterial({
    color: "#1b2740",
    // A night window should glow faintly, not read as a hole in the wall.
    emissive: new THREE.Color("#2b3b57"),
    emissiveIntensity: 1.1,
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
  linen: true,
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

export function geometryFor(size: Vec3, kind?: SurfaceKind): THREE.BufferGeometry {
  const tile = tileFor(kind);
  const key = `${size[0].toFixed(3)}|${size[1].toFixed(3)}|${size[2].toFixed(3)}|${tile}`;

  if (kind && ROUNDED.has(kind)) {
    const hit = rounded.get(key);
    if (hit) return hit;
    const built = roundedBoxGeometry(size[0], size[1], size[2]);
    rounded.set(key, built);
    return built;
  }

  const cached = geometries.get(key);
  if (cached) return cached;

  const [w, h, d] = size;
  const geometry = new THREE.BoxGeometry(w, h, d);
  const uv = geometry.getAttribute("uv");
  const TILE = tile;

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

/**
 * Chamfered surfaces. Currently none: ExtrudeGeometry fans its UVs around the
 * shape's perimeter, which tiles fine on a small moulding but produces
 * starburst patterns across a large flat panel like a rug or a duvet.
 */
const ROUNDED = new Set<SurfaceKind>();

const rounded = new Map<string, THREE.BufferGeometry>();

function roundedBoxGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  // Chamfer stays small relative to the piece, and can never swallow it.
  const radius = Math.max(0.0015, Math.min(0.013, Math.min(w, h, d) * 0.22));
  const eps = 1e-5;
  const r = radius - eps;

  const shape = new THREE.Shape();
  shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true);
  shape.absarc(eps, h - r * 2, eps, Math.PI, Math.PI / 2, true);
  shape.absarc(w - r * 2, h - r * 2, eps, Math.PI / 2, 0, true);
  shape.absarc(w - r * 2, eps, eps, 0, -Math.PI / 2, true);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, d - radius * 2),
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: r,
    bevelThickness: radius,
    curveSegments: 2,
  });
  geometry.center();

  // ExtrudeGeometry emits UVs in world units, so one divide matches the tiling
  // used by the sharp boxes.
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) / TILE, uv.getY(i) / TILE);
  }
  uv.needsUpdate = true;

  // Creased normals keep the faces flat while the chamfers stay smooth.
  return toCreasedNormals(geometry, 0.4);
}

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
