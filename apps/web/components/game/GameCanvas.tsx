"use client";

import { Canvas } from "@react-three/fiber";

import { Corridor } from "@/components/environment/Corridor";
import { FOG_COLOR, FOG_DENSITY } from "@/game/data/atmosphere";
import { EYE_HEIGHT } from "@/game/data/dimensions";
import { GREYBOX_CORRIDOR } from "@/game/data/corridorLayout";

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
      camera={{
        fov: 72,
        near: 0.05,
        far: 60,
        // Temporary vantage: standing at one end at eye height, looking down
        // the corridor (-Z is the camera's default forward). Step 4 replaces
        // this with the pointer-lock controller.
        position: [0, EYE_HEIGHT, GREYBOX_CORRIDOR.halfLength - 1.5],
      }}
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
       * Work light. Step 3 replaces this with ceiling fixtures and drops the
       * ambient back to a level where the flashlight matters.
       */}
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#8d8574", "#2a2320", 0.35]} />

      <Corridor />
    </Canvas>
  );
}
