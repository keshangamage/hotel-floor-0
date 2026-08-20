import * as THREE from "three";

import { LAMP_COLOR } from "@/game/data/atmosphere";
import type { SurfaceKind } from "@/game/types";

/** One unit cube shared by every box. Meshes scale it instead of allocating their own. */
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

const material = (color: string, roughness: number, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Muted and desaturated on purpose: saturated colour reads as cartoonish when lit dimly. */
export const MATERIALS: Record<SurfaceKind, THREE.MeshStandardMaterial> = {
  wall: material("#5a5348", 0.92),
  floor: material("#3b2f2b", 1.0),
  ceiling: material("#6e6a63", 0.95),
  door: material("#4a3b30", 0.72),
  trim: material("#4a463d", 0.85),
};

/** Nothing can sit between a slab and a ceiling lamp, so slabs never cast. */
export const CASTS_SHADOW: Record<SurfaceKind, boolean> = {
  wall: true,
  floor: false,
  ceiling: false,
  door: true,
  trim: true,
};

export const FIXTURE_MATERIAL = material("#1a1a1c", 0.55, 0.4);

/** The visible source. Emissive so the fixture reads as lit, not just lit-by. */
export const LAMP_PANEL_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#000000",
  emissive: new THREE.Color(LAMP_COLOR),
  emissiveIntensity: 2.5,
  roughness: 1,
});
