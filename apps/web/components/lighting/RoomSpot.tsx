import { useMemo } from "react";
import * as THREE from "three";

import type { LampSpec } from "@/game/types";

/**
 * A bare downward cone with no housing, for use under a fixture prop.
 *
 * Its real job is shadows: without them furniture has no contact with the floor
 * and reads as boxes floating in a lit room.
 */
export function RoomSpot({ spec }: { spec: LampSpec }) {
  const target = useMemo(() => new THREE.Object3D(), []);

  return (
    <group position={spec.position}>
      <primitive object={target} position={[0, -1, 0]} />
      <spotLight
        target={target}
        color={spec.color}
        intensity={spec.intensity}
        angle={1.35}
        penumbra={0.6}
        decay={2}
        distance={spec.distance ?? 8}
        castShadow={spec.castShadow}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.2}
        shadow-camera-far={9}
        shadow-bias={-0.0012}
      />
    </group>
  );
}
