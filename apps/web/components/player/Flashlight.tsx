import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { useGameStore } from "@/store/useGameStore";

/** Cool, so the player's own light reads apart from the hotel's warm tungsten. */
const COLOR = "#eaf0ff";
/** Carried at the hip, not the eye. A beam down the view axis lights only what
 *  it hides behind, so nothing it throws a shadow of is ever visible. */
const OFFSET_RIGHT = 0.22;
const OFFSET_DOWN = 0.2;
/** Aim far ahead: a near target swings the cone wildly as the player turns. */
const THROW = 12;

// Reused every frame so the loop stays allocation free.
const direction = new THREE.Vector3();
const right = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * The player's torch. Follows the camera rather than parenting to it, because
 * the default camera is not in the scene graph and a light below it would never
 * be collected for rendering.
 *
 * Mount after the Player so it reads the camera's final position, including
 * head bob, which is what gives the beam its walking sway.
 */
export function Flashlight() {
  const on = useGameStore((state) => state.flashlightOn);
  const camera = useThree((state) => state.camera);
  const light = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const spot = light.current;
    if (!spot || !on) return;

    camera.getWorldDirection(direction);
    right.crossVectors(direction, UP).normalize();

    spot.position
      .copy(camera.position)
      .addScaledVector(right, OFFSET_RIGHT)
      .addScaledVector(UP, -OFFSET_DOWN);
    target.position.copy(camera.position).addScaledVector(direction, THROW);
  });

  return (
    <>
      <primitive object={target} />
      <spotLight
        ref={light}
        target={target}
        // Hidden rather than unmounted: rebuilding the shadow map on every
        // press would hitch, and an invisible light is skipped before it costs
        // a pass.
        visible={on}
        color={COLOR}
        intensity={60}
        angle={0.44}
        penumbra={0.45}
        decay={2}
        distance={20}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.3}
        shadow-camera-far={20}
        shadow-bias={-0.0009}
        shadow-normalBias={0.02}
      />
    </>
  );
}
