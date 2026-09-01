import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

import { createWatch, stepWatch, type Watcher } from "@/game/systems/observation";
import type { Point3 } from "@/game/types";
import { useGameStore } from "@/store/useGameStore";

// Reused every frame so the loop stays allocation free.
const forward = new THREE.Vector3();
const watcher: Watcher = { at: { x: 0, y: 0, z: 0 }, facing: { x: 0, y: 0, z: -1 } };

/**
 * Calls back the moment the player has looked away from a place.
 *
 * The one hook everything in the brief's anomaly list needs: a chair that
 * moves unwatched, a door that opens behind you, a painting that changes as
 * you pass. Each of them only has to say where it is and what to do when
 * nobody is looking.
 */
export function useLookAway(
  target: Point3,
  onLookedAway: () => void,
  enabled = true,
): void {
  const camera = useThree((state) => state.camera);
  const watch = useRef(createWatch());
  // Held in a ref so a caller can pass a fresh closure every render without
  // restarting the watch. Written in an effect rather than during render,
  // which the compiler rules forbid.
  const handler = useRef(onLookedAway);
  useEffect(() => {
    handler.current = onLookedAway;
  }, [onLookedAway]);

  useFrame((_, delta) => {
    if (!enabled) return;
    // A paused game is not a player looking away: the world holds still.
    if (useGameStore.getState().phase !== "playing") return;

    camera.getWorldDirection(forward);
    watcher.at.x = camera.position.x;
    watcher.at.y = camera.position.y;
    watcher.at.z = camera.position.z;
    watcher.facing.x = forward.x;
    watcher.facing.y = forward.y;
    watcher.facing.z = forward.z;

    if (stepWatch(watch.current, watcher, target, Math.min(delta, 0.05))) {
      handler.current();
    }
  });
}
