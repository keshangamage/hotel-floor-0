import * as THREE from "three";

import type { SurfaceKind } from "@/game/types";

/**
 * One unit cube, shared by every box in the hotel.
 *
 * Meshes scale it rather than each allocating their own BoxGeometry, so a
 * corridor of ~40 boxes costs exactly one geometry upload. Three.js builds a
 * correct normal matrix for non-uniform scale, so lighting stays right.
 */
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/**
 * Materials are created once at module scope and shared across every mesh of
 * that kind. Colours are muted and desaturated on purpose — under the dim
 * lighting of step 3 anything saturated reads as cartoonish.
 */
const material = (color: string, roughness: number, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

export const MATERIALS: Record<SurfaceKind, THREE.MeshStandardMaterial> = {
  wall: material("#5a5348", 0.92),
  floor: material("#3b2f2b", 1.0),
  ceiling: material("#6e6a63", 0.95),
  door: material("#4a3b30", 0.72),
  trim: material("#4a463d", 0.85),
};

/**
 * Floors and ceilings never need to cast — nothing can be between them and a
 * ceiling lamp. Skipping them keeps the shadow pass cheap once step 3 lands.
 */
export const CASTS_SHADOW: Record<SurfaceKind, boolean> = {
  wall: true,
  floor: false,
  ceiling: false,
  door: true,
  trim: true,
};
