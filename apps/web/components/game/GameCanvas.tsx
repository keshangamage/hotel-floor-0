"use client";

import { Canvas } from "@react-three/fiber";

import { FOG_COLOR, FOG_DENSITY } from "@/game/data/atmosphere";

/**
 * Owns the WebGL context and every renderer-wide decision: camera lens, clipping
 * planes, fog and pixel-ratio budget. Everything inside the canvas is scene content.
 *
 * This module must never be imported from a Server Component — see `GameShell`.
 */
export default function GameCanvas() {
  return (
    <Canvas
      shadows
      // Cap the pixel ratio: retina displays would otherwise quadruple the
      // fragment cost for a game that leans on fog and darkness anyway.
      dpr={[1, 1.5]}
      camera={{ fov: 72, near: 0.05, far: 60 }}
      gl={{ powerPreference: "high-performance", antialias: true }}
      // The canvas is the whole viewport; the DOM around it is inert.
      style={{ position: "absolute", inset: 0 }}
    >
      {/*
       * Exponential fog does double duty: it carries the atmosphere and it hides
       * the far clipping plane, so the corridor can simply fade out.
       */}
      <fogExp2 attach="fog" args={[FOG_COLOR, FOG_DENSITY]} />
      <color attach="background" args={[FOG_COLOR]} />

      {/*
       * Scene content arrives in step 2 (corridor) and step 3 (lighting).
       * A single dim ambient keeps the canvas from reading as a dead black div.
       */}
      <ambientLight intensity={0.12} />
    </Canvas>
  );
}
