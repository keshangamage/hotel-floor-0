"use client";

import { Canvas } from "@react-three/fiber";

import { Corridor } from "@/components/environment/Corridor";
import { HotelLighting } from "@/components/lighting/HotelLighting";
import { InputActions } from "@/components/player/InputActions";
import { LookControls } from "@/components/player/LookControls";
import { Player } from "@/components/player/Player";
import { FOG_COLOR, FOG_DENSITY } from "@/game/data/atmosphere";
import { CORRIDOR_LAYOUT, GREYBOX_CORRIDOR } from "@/game/data/corridorLayout";
import { EYE_HEIGHT } from "@/game/data/dimensions";

/**
 * Owns the WebGL context and every renderer-wide decision: camera lens, clipping
 * planes, fog and pixel-ratio budget. Never import this from a Server Component.
 */
export default function GameCanvas() {
  return (
    <Canvas
      // PCFSoft: hard shadow edges give away the low map resolution.
      shadows="soft"
      // Retina would otherwise quadruple fragment cost for a game built on darkness.
      dpr={[1, 1.5]}
      camera={{
        fov: 72,
        near: 0.05,
        far: 60,
        // Temporary vantage until step 4 adds the controller. -Z is camera forward.
        position: [0, EYE_HEIGHT, GREYBOX_CORRIDOR.halfLength - 1.5],
      }}
      gl={{ powerPreference: "high-performance", antialias: true }}
      style={{ position: "absolute", inset: 0 }}
    >
      {/* Fog carries the atmosphere and hides the far clipping plane. */}
      <fogExp2 attach="fog" args={[FOG_COLOR, FOG_DENSITY]} />
      <color attach="background" args={[FOG_COLOR]} />

      <LookControls />
      <InputActions />
      <Player layout={CORRIDOR_LAYOUT} />

      <HotelLighting layout={CORRIDOR_LAYOUT} />
      <Corridor layout={CORRIDOR_LAYOUT} />
    </Canvas>
  );
}
