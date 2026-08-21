import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { useDynamicCollider } from "@/components/game/Colliders";
import { setCollider } from "@/game/systems/colliders";

import { MATERIALS, UNIT_BOX } from "./resources";

/** Seconds for a panel to travel its full stroke. */
const TRAVEL_TIME = 1.1;

export interface SlidingDoorProps {
  /** Panel centre when fully closed. */
  closedAt: [number, number, number];
  size: [number, number, number];
  /** Direction and distance the panel slides along X when opening. */
  stroke: number;
  open: boolean;
}

/**
 * One leaf of a sliding door. The collider moves with the panel rather than
 * being switched off, so the opening becomes passable because the door really
 * is out of the way.
 */
export function SlidingDoor({ closedAt, size, stroke, open }: SlidingDoorProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const collider = useDynamicCollider();
  const progress = useRef(0);

  useFrame((_, delta) => {
    const target = open ? 1 : 0;
    const step = Math.min(delta, 0.05) / TRAVEL_TIME;
    if (progress.current < target) {
      progress.current = Math.min(target, progress.current + step);
    } else if (progress.current > target) {
      progress.current = Math.max(target, progress.current - step);
    }

    // Ease so the panel does not start and stop abruptly.
    const eased = progress.current * progress.current * (3 - 2 * progress.current);
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
