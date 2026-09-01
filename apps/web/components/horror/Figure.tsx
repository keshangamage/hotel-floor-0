import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import { distanceTo, isFacing, type Watcher } from "@/game/systems/observation";
import { LINGER, STAND_HEIGHT, TOO_CLOSE, presenceOn } from "@/game/systems/presence";
import type { FloorSpec } from "@/game/types";
import { useGameStore } from "@/store/useGameStore";

export const FIGURE_URL = "/models/figure.glb";

/** It hangs in the air and drifts. The other clip turns it to look at you. */
const IDLE = "idle_up_down";

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
  const phase = useGameStore((state) => state.phase);
  const stand = useMemo(() => presenceOn(spec), [spec]);

  const { scene, animations } = useGLTF(FIGURE_URL, false);
  // Cloned rather than used directly: drei hands out one cached scene, and a
  // floor change mounts the next figure before the last one has let go of it.
  // SkeletonUtils rebinds the skeleton, which a plain clone does not.
  const model = useMemo(() => clone(scene), [scene]);
  const { actions, mixer } = useAnimations(animations, model);

  const group = useRef<THREE.Group>(null);
  const seen = useRef({ facing: false, held: 0, gone: false });

  useEffect(() => {
    actions[IDLE]?.reset().play();
  }, [actions]);

  // The mixer runs on drei's own frame loop, which does not know about the
  // menu, so a paused game leaves it drifting. Held in a ref because the
  // compiler treats a hook's return value as something it owns.
  const clock = useRef<THREE.AnimationMixer | null>(null);
  useEffect(() => {
    clock.current = mixer;
  }, [mixer]);
  useEffect(() => {
    if (clock.current) clock.current.timeScale = phase === "playing" ? 1 : 0;
  }, [phase]);

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
    // Turned away from the lift, so the player only ever gets its back.
    //
    // It has a face. They do not see it: looking straight at this thing is
    // what makes it not be there, so the one view of it anybody gets is from
    // behind, standing in the light, not turning round.
    <group ref={group} position={[stand.x, 0, stand.z]} rotation={[0, Math.PI, 0]}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(FIGURE_URL, false);
