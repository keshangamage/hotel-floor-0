import { useMemo } from "react";
import * as THREE from "three";

import { FIXTURE_MATERIAL, LAMP_PANEL_MATERIAL, UNIT_BOX } from "@/components/environment/resources";
import { LAMP_COLOR } from "@/game/data/atmosphere";
import type { LampSpec } from "@/game/types";

/**
 * A recessed downlight: housing, emissive panel and a spotlight aimed at the floor.
 * Spotlights rather than point lights because a point light shadow is a cube map
 * (six passes) while a spotlight shadow is a single 2D map.
 */
export function CeilingLamp({ spec }: { spec: LampSpec }) {
  // A spotlight aims at its target's world position, so each lamp needs its own
  // target parented below it. Without one they would all aim at the origin.
  const target = useMemo(() => new THREE.Object3D(), []);

  return (
    <group position={spec.position}>
      <mesh geometry={UNIT_BOX} material={FIXTURE_MATERIAL} scale={[0.46, 0.06, 0.46]} />
      <mesh
        geometry={UNIT_BOX}
        material={LAMP_PANEL_MATERIAL}
        position={[0, -0.04, 0]}
        scale={[0.38, 0.02, 0.38]}
      />

      <primitive object={target} position={[0, -1, 0]} />
      <spotLight
        target={target}
        position={[0, -0.08, 0]}
        color={LAMP_COLOR}
        intensity={spec.intensity}
        angle={0.95}
        penumbra={0.7}
        decay={2}
        distance={11}
        castShadow={spec.castShadow}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.3}
        shadow-camera-far={11}
        shadow-bias={-0.0015}
      />
    </group>
  );
}
