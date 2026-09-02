"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";

import { Doors } from "@/components/environment/Doors";
import { Figure } from "@/components/horror/Figure";
import { GoingOut } from "@/components/horror/GoingOut";
import { Elevator } from "@/components/environment/Elevator";
import { FloorGeometry } from "@/components/environment/FloorGeometry";
import { Items } from "@/components/environment/Item";
import { Mirrors } from "@/components/environment/Mirror";
import { Notes } from "@/components/environment/Note";
import { Paintings } from "@/components/environment/Paintings";
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

import { Ambience } from "./Ambience";
import { Audio } from "./Audio";
import { ColliderProvider } from "./Colliders";
import { Effects } from "./Effects";
import { EnvironmentProbe } from "./EnvironmentProbe";
import { InteractionDriver, InteractionProvider } from "./Interactions";
import { PerfProbe } from "./PerfProbe";

/**
 * Everything belonging to one floor. Regenerating the layout swaps the level in
 * place: the player keeps their position, which is what lets them step out of
 * the elevator onto a different floor.
 */
function Scene() {
  const floorNumber = useGameStore((state) => state.floorNumber);
  const seed = useGameStore((state) => state.seed);
  const spec = useMemo(() => generateFloor(floorNumber, seed), [floorNumber, seed]);
  const layout = useMemo(() => buildFloor(spec), [spec]);

  return (
      <ColliderProvider boxes={layout.boxes}>
      <InteractionProvider>
        <LookControls />
        <HotelLighting layout={layout} />
        <FloorGeometry layout={layout} />
        <Props layout={layout} wrong={spec.anomaly?.kind} />
        <Paintings
          paintings={layout.paintings}
          turning={
            spec.anomaly?.kind === "painting-turns" && layout.paintings.length > 0
              ? spec.anomaly.target % layout.paintings.length
              : undefined
          }
        />
        <Notes notes={layout.notes} />
        <Items items={layout.items} />
        <Mirrors mirrors={layout.mirrors} />
        {/* Doors register their frame callback before the player, so
            colliders are already positioned when movement resolves. */}
        <Doors layout={layout} />
        <RoomSigns layout={layout} />
        <Elevator anomaly={spec.anomaly} />
        {/* Keyed on the floor: being spent is its only state, and each floor
            under the hotel gets its own. */}
        <Figure key={floorNumber} spec={spec} />
        {/* Floor zero only, and keyed with it so a new visit is a new walk. */}
        <GoingOut key={`out-${floorNumber}`} spec={spec} layout={layout} />
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
  const run = useGameStore((state) => state.run);

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
      {/* Keyed on the run, so starting again rebuilds the player and the car
          instead of leaving them where the last run ended. */}
      <Scene key={run} />
      {/* After the scene, so it reads the player's final motion each frame. */}
      <Audio />
      {/* Unprompted sound: the building settling, a failing fitting, a voice. */}
      <Ambience />
      <Effects />
      {/* Last, so it times a whole frame rather than part of one. */}
      <PerfProbe />
    </Canvas>
  );
}
