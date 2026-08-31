import { useFrame } from "@react-three/fiber";
import { useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { useDynamicCollider } from "@/components/game/Colliders";
import { Interactable } from "@/components/interaction/Interactable";
import { audio } from "@/game/systems/audio";
import { doorFootprint, doorYaw } from "@/game/systems/doors";
import type { DoorSpec } from "@/game/types";
import { useGameStore } from "@/store/useGameStore";

import { FIXTURE_MATERIAL, MATERIALS, UNIT_BOX } from "./resources";

/** Seconds for a full swing. */
const SWING_TIME = 0.9;

export function HingedDoor({ spec }: { spec: DoorSpec }) {
  const pivot = useRef<THREE.Group>(null);
  const collider = useDynamicCollider();
  const progress = useRef(0);
  const [open, setOpen] = useState(false);

  // Roughly the middle of the leaf, at handle height. The hinge alone would put
  // a corridor door's creak half a metre into the wall.
  const source = useMemo<[number, number, number]>(
    () => [spec.hinge[0], 1.05, spec.hinge[2] + spec.width / 2],
    [spec.hinge, spec.width],
  );

  const toggle = useCallback(() => {
    if (spec.locked) return;
    const next = !open;
    setOpen(next);
    // Closing drags the same hinge the other way, so it is the same creak a
    // little lower and heavier.
    audio.playAt("door", source, { rate: next ? 1 : 0.88, gain: next ? 0.9 : 1 });
  }, [spec.locked, open, source]);

  const prompt = spec.locked ? "Locked" : open ? "Close" : "Open";

  useFrame((_, delta) => {
    // A swing carries its collider with it, so letting one finish during a
    // pause moves solid geometry while the player is in the menu.
    if (useGameStore.getState().phase !== "playing") return;

    const target = open ? 1 : 0;
    const step = Math.min(delta, 0.05) / SWING_TIME;
    if (progress.current < target) progress.current = Math.min(target, progress.current + step);
    else if (progress.current > target) progress.current = Math.max(target, progress.current - step);

    const yaw = doorYaw(spec, progress.current);
    if (pivot.current) pivot.current.rotation.y = yaw;
    doorFootprint(spec, yaw, collider);
  });

  return (
    <Interactable prompt={prompt} onInteract={toggle}>
      <group ref={pivot} position={spec.hinge} rotation={[0, spec.closedYaw, 0]}>
        <mesh
          geometry={UNIT_BOX}
          material={MATERIALS.door}
          position={[0, spec.height / 2, spec.width / 2]}
          scale={[spec.thickness, spec.height, spec.width]}
          castShadow
          receiveShadow
        />
        {/* Handle on the free edge, on both faces. */}
        {[-1, 1].map((face) => (
          <mesh
            key={face}
            geometry={UNIT_BOX}
            material={FIXTURE_MATERIAL}
            position={[face * (spec.thickness / 2 + 0.02), 1.02, spec.width - 0.09]}
            scale={[0.04, 0.03, 0.13]}
            castShadow
          />
        ))}
      </group>
    </Interactable>
  );
}
