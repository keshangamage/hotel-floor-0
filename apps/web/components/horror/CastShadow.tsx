import { useMemo } from "react";
import * as THREE from "three";

import type { ShadowSpec } from "@/game/types";

/**
 * The shape, drawn once into a canvas.
 *
 * A hard rectangle would read as a decal and a real shadow has no edge, so
 * this is a soft body with a head on it, blurred by drawing it as a stack of
 * fading ellipses. Built lazily: there is no document until this runs in a
 * browser, and most floors never ask for it.
 */
let mask: THREE.Texture | null = null;

function shape(): THREE.Texture {
  if (mask) return mask;

  const W = 128;
  const H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  // Darkest in the middle of each part, fading to nothing at the edge, which
  // is what a shadow cast by a soft source actually looks like.
  const blob = (cx: number, cy: number, rx: number, ry: number) => {
    for (let i = 12; i >= 1; i -= 1) {
      const t = i / 12;
      ctx.fillStyle = `rgba(255,255,255,${0.14 * (1 - t) + 0.02})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * t, ry * t, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  blob(W / 2, H * 0.62, W * 0.34, H * 0.3);
  blob(W / 2, H * 0.2, W * 0.15, H * 0.1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  mask = texture;
  return texture;
}

/**
 * A shadow in the corridor that nothing is standing in.
 *
 * No light in the game makes this. It is a shape lying on the floor, and it
 * survives being walked up to, which a trick of the lighting would not.
 */
export function CastShadow({ spec }: { spec: ShadowSpec }) {
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#000000",
    transparent: true,
    opacity: 0.62,
    alphaMap: shape(),
    // Lying on the floor, so it must not fight the floor for depth, and it
    // must not write depth of its own for things to sort against.
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  }), []);
  const geometry = useMemo(() => new THREE.PlaneGeometry(spec.width, spec.length), [spec]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={spec.position}
      rotation={[-Math.PI / 2, 0, spec.yaw]}
    />
  );
}

export function CastShadows({ shadows }: { shadows: readonly ShadowSpec[] }) {
  return (
    <>
      {shadows.map((spec) => (
        <CastShadow key={spec.id} spec={spec} />
      ))}
    </>
  );
}
