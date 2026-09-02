import { MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";

import type { MirrorSpec } from "@/game/types";

import { MATERIALS, UNIT_BOX } from "./resources";

/** Shared: the glass differs only in how it is placed. */
const GLASS = new THREE.PlaneGeometry(1, 1);

/**
 * The one mirror in the hotel.
 *
 * It is the only surface here that draws the scene a second time, so it is
 * kept small, kept at a low resolution, and kept inside a room. The player
 * standing in the corridor has a wall between them and it, and a culled mesh
 * never reaches the pass at all.
 *
 * It does not show the player, because there is no player to show: this is a
 * game seen down its own eyes and nothing was ever modelled behind them. In
 * an ordinary game that is a thing to apologise for. Here it is the room
 * behind you, at night, with you missing out of it.
 */
export function Mirror({ spec }: { spec: MirrorSpec }) {
  return (
    <group position={spec.position} rotation={[0, spec.yaw, 0]}>
      {/* Frame, sized a little larger than the glass. */}
      <mesh
        geometry={UNIT_BOX}
        material={MATERIALS.trim}
        position={[0, 0, -0.02]}
        scale={[spec.width + 0.07, spec.height + 0.07, 0.035]}
      />
      <mesh geometry={GLASS} scale={[spec.width, spec.height, 1]}>
        <MeshReflectorMaterial
          // Small and unblurred. Blur is extra passes on top of the reflection
          // itself, and this is already the most expensive object in the game.
          resolution={256}
          blur={[0, 0]}
          mixBlur={0}
          mixStrength={1}
          mirror={0.72}
          // Old glass, gone slightly dark, so it never looks like a window.
          color="#8f8d88"
          metalness={0.35}
          roughness={0.55}
        />
      </mesh>
    </group>
  );
}

export function Mirrors({ mirrors }: { mirrors: readonly MirrorSpec[] }) {
  return (
    <>
      {mirrors.map((spec) => (
        <Mirror key={spec.id} spec={spec} />
      ))}
    </>
  );
}
