import { useMemo } from "react";
import * as THREE from "three";

import { CORRIDOR_HALF_WIDTH, DOOR_WIDTH } from "@/game/data/dimensions";
import type { DoorSpec, FloorLayout } from "@/game/types";

import { UNIT_BOX } from "./resources";

const PLAQUE = new THREE.MeshStandardMaterial({
  color: "#7a6a4c",
  roughness: 0.42,
  metalness: 0.6,
});

const cache = new Map<string, THREE.CanvasTexture>();

/**
 * Numerals drawn to a canvas rather than shipping a font. Cached by text, so
 * eight doors on a floor cost a handful of small textures.
 */
function numberTexture(text: string): THREE.CanvasTexture {
  const existing = cache.get(text);
  if (existing) return existing;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#141109";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#d8c69c";
    ctx.font = "600 74px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(text, texture);
  return texture;
}

function Sign({ door }: { door: DoorSpec }) {
  const texture = useMemo(() => numberTexture(door.label ?? ""), [door.label]);
  // No number, no plate. An empty plaque reads as a texture that failed to
  // load; bare wall reads as a sign that has come off.
  if (!door.label) return null;
  // The hinge sits on the low-Z jamb, so the latch side is the far one.
  const side = door.hinge[0] > 0 ? 1 : -1;
  const z = door.hinge[2] + DOOR_WIDTH + 0.15;

  return (
    <group
      position={[side * (CORRIDOR_HALF_WIDTH - 0.012), 1.58, z]}
      rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
    >
      <mesh geometry={UNIT_BOX} material={PLAQUE} scale={[0.17, 0.095, 0.014]} castShadow />
      <mesh position={[0, 0, 0.008]}>
        <planeGeometry args={[0.15, 0.078]} />
        <meshStandardMaterial map={texture} roughness={0.5} metalness={0.25} />
      </mesh>
    </group>
  );
}

/** A numbered plaque beside every door, which is what makes a corridor a hotel. */
export function RoomSigns({ layout }: { layout: FloorLayout }) {
  return (
    <>
      {layout.doors.map((door) => (
        <Sign key={door.id} door={door} />
      ))}
    </>
  );
}
