"use client";

import { Canvas } from "@react-three/fiber";

import { Doors } from "@/components/environment/Doors";
import { Elevator } from "@/components/environment/Elevator";
import { FloorGeometry } from "@/components/environment/FloorGeometry";
import { Switches } from "@/components/environment/Switches";
import { HotelLighting } from "@/components/lighting/HotelLighting";
import { InputActions } from "@/components/player/InputActions";
import { LookControls } from "@/components/player/LookControls";
import { Player } from "@/components/player/Player";
import { FOG_COLOR, FOG_DENSITY } from "@/game/data/atmosphere";
import { FLOOR_5_LAYOUT } from "@/game/data/floor";

import { ColliderProvider } from "./Colliders";
import { InteractionDriver, InteractionProvider } from "./Interactions";

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
      // The player controller owns position and yaw from the first frame.
      camera={{ fov: 72, near: 0.05, far: 60 }}
      gl={{ powerPreference: "high-performance", antialias: true }}
      style={{ position: "absolute", inset: 0 }}
    >
      {/* Fog carries the atmosphere and hides the far clipping plane. */}
      <fogExp2 attach="fog" args={[FOG_COLOR, FOG_DENSITY]} />
      <color attach="background" args={[FOG_COLOR]} />

      <ColliderProvider boxes={FLOOR_5_LAYOUT.boxes}>
        <InteractionProvider>
          <LookControls />
          <HotelLighting layout={FLOOR_5_LAYOUT} />
          <FloorGeometry layout={FLOOR_5_LAYOUT} />
          {/* Doors register their frame callback before the player, so
              colliders are already positioned when movement resolves. */}
          <Doors layout={FLOOR_5_LAYOUT} />
          <Elevator />
          <Switches layout={FLOOR_5_LAYOUT} />
          <InputActions />
          <Player layout={FLOOR_5_LAYOUT} />
          {/* Last, so the raycast reads the camera's final position. */}
          <InteractionDriver />
        </InteractionProvider>
      </ColliderProvider>
    </Canvas>
  );
}
