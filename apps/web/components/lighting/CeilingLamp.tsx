import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import {
  DEAD_PANEL_MATERIAL,
  FIXTURE_MATERIAL,
  LAMP_PANEL_MATERIAL,
  UNIT_BOX,
} from "@/components/environment/resources";
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
  const lit = spec.lit !== false;
  const light = useRef<THREE.SpotLight>(null);
  const panel = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!spec.flicker) return;
    const t = state.clock.elapsedTime;
    // Two waves that never line up, so it never falls into a rhythm, plus an
    // occasional near blackout. A sine reads as a pulse, not a fault.
    const wobble = 0.7 + 0.3 * Math.sin(t * 37.1) * Math.sin(t * 11.7);
    const failing = Math.sin(t * 2.3) > 0.92 ? 0.06 : 1;
    const level = wobble * failing;
    if (light.current) light.current.intensity = spec.intensity * level;
    // The panel has to follow, or a dark corridor keeps a lit rectangle in it.
    if (panel.current) panel.current.visible = level > 0.35;
  });

  return (
    <group position={spec.position}>
      <mesh geometry={UNIT_BOX} material={FIXTURE_MATERIAL} scale={[0.46, 0.06, 0.46]} />
      <mesh
        ref={panel}
        geometry={UNIT_BOX}
        material={lit ? LAMP_PANEL_MATERIAL : DEAD_PANEL_MATERIAL}
        position={[0, -0.04, 0]}
        scale={[0.38, 0.02, 0.38]}
      />

      {lit && (
        <>
          <primitive object={target} position={[0, -1, 0]} />
          <spotLight
            ref={light}
            target={target}
            position={[0, -0.08, 0]}
            color={LAMP_COLOR}
            intensity={spec.intensity}
            angle={1.25}
            penumbra={0.55}
            decay={2}
            distance={11}
            castShadow={spec.castShadow}
            shadow-mapSize={[2048, 2048]}
            shadow-camera-near={0.3}
            shadow-camera-far={11}
            shadow-bias={-0.0009}
            shadow-normalBias={0.02}
          />
        </>
      )}
    </group>
  );
}
