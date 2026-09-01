import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { distanceTo, isFacing, type Watcher } from "@/game/systems/observation";
import { LINGER, STAND_HEIGHT, TOO_CLOSE, presenceOn } from "@/game/systems/presence";
import type { FloorSpec } from "@/game/types";
import { useGameStore } from "@/store/useGameStore";

// One person, built once. Legs to shoulders, and a head.
const BODY = new THREE.CapsuleGeometry(0.2, 1.05, 4, 12);
const SHOULDERS = new THREE.BoxGeometry(0.46, 0.15, 0.25);
const HEAD = new THREE.SphereGeometry(0.115, 14, 12);

/**
 * Lit, not unlit. A pure black shape would be invisible against fog this dark,
 * and a self-lit one would be a ghost. This is a person in a corridor: the
 * lamp above finds them, and so does the torch.
 */
const SKIN = new THREE.MeshStandardMaterial({ color: "#0c0c0f", roughness: 1 });

// Reused every frame so the loop stays allocation free.
const forward = new THREE.Vector3();
const watcher: Watcher = { at: { x: 0, y: 0, z: 0 }, facing: { x: 0, y: 0, z: -1 } };

/**
 * Someone standing in the corridor, on the floors under the hotel.
 *
 * It does nothing. It does not approach, and it cannot be reached: looking
 * straight at it for half a second is enough for it to not be there, and
 * walking at it is enough as well. There is never a second chance to check,
 * which is the whole of it, and is why nothing in the game ever confirms it.
 *
 * Mount this keyed on the floor. Its one piece of state is whether it has been
 * spent, and a new floor is a new one.
 */
export function Figure({ spec }: { spec: FloorSpec }) {
  const camera = useThree((state) => state.camera);
  const stand = useMemo(() => presenceOn(spec), [spec]);
  const group = useRef<THREE.Group>(null);
  const seen = useRef({ facing: false, held: 0, gone: false });

  useFrame((_, delta) => {
    const node = group.current;
    if (!node || !stand) return;
    const state = seen.current;
    if (state.gone) return;
    if (useGameStore.getState().phase !== "playing") return;

    camera.getWorldDirection(forward);
    watcher.at.x = camera.position.x;
    watcher.at.y = camera.position.y;
    watcher.at.z = camera.position.z;
    watcher.facing.x = forward.x;
    watcher.facing.y = forward.y;
    watcher.facing.z = forward.z;

    const target = { x: stand.x, y: STAND_HEIGHT, z: stand.z };
    const facing = isFacing(watcher, target, state.facing);
    if (facing !== state.facing) {
      state.facing = facing;
      state.held = 0;
    } else {
      state.held += Math.min(delta, 0.05);
    }

    // Walking at it counts as looking at it. Otherwise the player arrives, and
    // whatever they find there is an answer.
    if (distanceTo(watcher, target) < TOO_CLOSE || (facing && state.held >= LINGER)) {
      state.gone = true;
      node.visible = false;
    }
  });

  if (!stand) return null;

  return (
    <group ref={group} position={[stand.x, 0, stand.z]}>
      <mesh geometry={BODY} material={SKIN} position={[0, 0.85, 0]} />
      <mesh geometry={SHOULDERS} material={SKIN} position={[0, 1.42, 0]} />
      <mesh geometry={HEAD} material={SKIN} position={[0, 1.66, 0]} />
    </group>
  );
}
