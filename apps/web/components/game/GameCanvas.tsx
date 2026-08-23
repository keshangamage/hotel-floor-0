"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";

import { Doors } from "@/components/environment/Doors";
import { Elevator } from "@/components/environment/Elevator";
import { FloorGeometry } from "@/components/environment/FloorGeometry";
import { Paintings } from "@/components/environment/Painting";
import { Props } from "@/components/environment/Props";
import { RoomSigns } from "@/components/environment/RoomSign";
import { Switches } from "@/components/environment/Switches";
import { HotelLighting } from "@/components/lighting/HotelLighting";
import { Flashlight } from "@/components/player/Flashlight";
import { InputActions } from "@/components/player/InputActions";
import { LookControls } from "@/components/player/LookControls";
import { Player } from "@/components/player/Player";
import { FOG_COLOR, FOG_DENSITY } from "@/game/data/atmosphere";
import { buildFloor } from "@/game/data/floor";
import { generateFloor } from "@/game/generation/generateFloor";
import { useGameStore } from "@/store/useGameStore";

import { Audio } from "./Audio";
import { ColliderProvider } from "./Colliders";
import { Effects } from "./Effects";
import { EnvironmentProbe } from "./EnvironmentProbe";
import { InteractionDriver, InteractionProvider } from "./Interactions";

/**
 * Everything belonging to one floor. Regenerating the layout swaps the level in
 * place: the player keeps their position, which is what lets them step out of
 * the elevator onto a different floor.
 */
function Scene() {
  const floorNumber = useGameStore((state) => state.floorNumber);
  const seed = useGameStore((state) => state.seed);
  const layout = useMemo(() => buildFloor(generateFloor(floorNumber, seed)), [floorNumber, seed]);

  return (
      <ColliderProvider boxes={layout.boxes}>
      <InteractionProvider>
        <LookControls />
        <HotelLighting layout={layout} />
        <FloorGeometry layout={layout} />
        <Props layout={layout} />
        <Paintings paintings={layout.paintings} />
        {/* Doors register their frame callback before the player, so
            colliders are already positioned when movement resolves. */}
        <Doors layout={layout} />
        <RoomSigns layout={layout} />
        <Elevator />
        <Switches layout={layout} />
        <InputActions />
        <Player layout={layout} />
        {/* After the player, so the beam follows the camera's final position. */}
        <Flashlight />
        {/* Last, so the raycast reads the camera's final position. */}
        <InteractionDriver />
      </InteractionProvider>
    </ColliderProvider>
  );
}

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

      <EnvironmentProbe />
      <Scene />
      {/* After the scene, so it reads the player's final motion each frame. */}
      <Audio />
      <Effects />
    </Canvas>
  );
}
