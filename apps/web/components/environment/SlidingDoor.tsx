import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { useDynamicCollider } from "@/components/game/Colliders";
import { setCollider } from "@/game/systems/colliders";

import { MATERIALS, UNIT_BOX } from "./resources";

export interface SlidingDoorProps {
  /** Panel centre when fully closed. */
  closedAt: [number, number, number];
  size: [number, number, number];
  /** Direction and distance the panel slides along X when opening. */
  stroke: number;
  /** 0 shut, 1 fully open. Owned by the elevator state machine. */
  progress: () => number;
}

/**
 * One leaf of a sliding door. The collider moves with the panel rather than
 * being switched off, so the opening becomes passable because the door really
 * is out of the way.
 */
export function SlidingDoor({ closedAt, size, stroke, progress }: SlidingDoorProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const collider = useDynamicCollider();

  useFrame(() => {
    // Ease so the panel does not start and stop abruptly.
    const t = progress();
    const eased = t * t * (3 - 2 * t);
    const x = closedAt[0] + stroke * eased;

    if (mesh.current) mesh.current.position.x = x;
    setCollider(collider, [x, closedAt[1], closedAt[2]], size);
  });

  return (
    <mesh
      ref={mesh}
      geometry={UNIT_BOX}
      material={MATERIALS.metal}
      position={closedAt}
      scale={size}
      castShadow
      receiveShadow
    />
  );
}
