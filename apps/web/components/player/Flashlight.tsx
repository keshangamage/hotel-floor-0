import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { drain, waver } from "@/game/systems/torch";
import { useGameStore } from "@/store/useGameStore";

/** Cool, so the player's own light reads apart from the hotel's warm tungsten. */
const COLOR = "#eaf0ff";
/** Carried at the hip, not the eye. A beam down the view axis lights only what
 *  it hides behind, so nothing it throws a shadow of is ever visible. */
const OFFSET_RIGHT = 0.22;
const OFFSET_DOWN = 0.2;
/** Aim far ahead: a near target swings the cone wildly as the player turns. */
const THROW = 12;
/** Full brightness. Scaled by whatever is left in the cell. */
const INTENSITY = 60;
/** How often the live charge is written back to the store, in seconds. */
const REPORT_EVERY = 2;

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
  // The live value. The store holds a coarse copy for the warning and the save.
  const charge = useRef(useGameStore.getState().torch);
  const sinceReport = useRef(0);

  // A fresh cell, or a save coming back. The frame loop only ever drains, so
  // anything that puts charge in has to reach the live value this way.
  const stored = useGameStore((state) => state.torch);
  useEffect(() => {
    if (stored > charge.current) charge.current = stored;
  }, [stored]);

  useFrame((state, delta) => {
    const spot = light.current;
    if (!spot) return;

    // Off: dark, and not paying for a shadow pass it cannot be seen in.
    if (!on) {
      spot.intensity = 0;
      spot.shadow.autoUpdate = false;
      return;
    }
    spot.shadow.autoUpdate = true;

    const store = useGameStore.getState();
    if (store.phase === "playing") {
      const step = Math.min(delta, 0.05);
      charge.current = drain(charge.current, step, true);
      spot.intensity = INTENSITY * waver(charge.current, state.clock.elapsedTime);

      sinceReport.current += step;
      if (sinceReport.current >= REPORT_EVERY || charge.current === 0) {
        sinceReport.current = 0;
        if (store.torch !== charge.current) store.setTorch(charge.current);
        // A torch that has gone out is off, not on and dark: the switch has to
        // mean something the next time it is pressed.
        if (charge.current === 0 && store.flashlightOn) store.toggleFlashlight();
      }
    }

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
        // Neither unmounted nor hidden. Both change how many lights the
        // renderer sees, and it recompiles every material in the scene to
        // match, which is a stall on a key the player presses constantly. It
        // is turned off by going dark, and its shadow map stops redrawing.
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
