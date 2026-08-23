import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

import { FOOTSTEPS } from "@/game/data/footsteps.generated";
import { audio } from "@/game/systems/audio";
import { createStepTracker, stepDue, stepWeight } from "@/game/systems/footsteps";
import { motion } from "@/game/systems/motion";
import { useGameStore } from "@/store/useGameStore";

/** Below this the player is shuffling against a wall, not walking. */
const MOVING = 0.35;

// Reused every frame so the loop stays allocation free.
const forward = new THREE.Vector3();
const ear: [number, number, number] = [0, 0, 0];
const facing: [number, number, number] = [0, 0, 0];

/**
 * Drives the game's sound from what the player is doing.
 *
 * Mounted outside the floor scene so it survives a floor change: the audio
 * context can only be started from a user gesture, and rebuilding it on every
 * elevator ride would lose that permission.
 */
export function Audio() {
  const phase = useGameStore((state) => state.phase);
  const camera = useThree((state) => state.camera);
  const steps = useRef(createStepTracker());

  useEffect(() => {
    if (phase !== "playing") return;

    let tone: { stop: () => void } | null = null;
    let cancelled = false;
    // The click that locked the pointer is the gesture the context needs.
    void audio.resume().then(() => {
      if (cancelled) return;
      tone = audio.roomTone();
      // Failure here is not fatal: steps fall back to being synthesised.
      void audio.loadFootsteps("/audio/footsteps.wav", FOOTSTEPS)
        .catch((error: unknown) => console.warn("footstep samples unavailable", error));
      void audio.loadClip("door", "/audio/door.wav")
        .catch((error: unknown) => console.warn("door sample unavailable", error));
    });

    return () => {
      cancelled = true;
      tone?.stop();
    };
  }, [phase]);

  useFrame(() => {
    if (!audio.running) return;

    // Positional sounds are placed relative to this, so it has to track the
    // camera every frame or they all collapse to the middle of the corridor.
    camera.getWorldDirection(forward);
    ear[0] = camera.position.x;
    ear[1] = camera.position.y;
    ear[2] = camera.position.z;
    facing[0] = forward.x;
    facing[1] = forward.y;
    facing[2] = forward.z;
    audio.setListener(ear, facing);

    if (!motion.grounded || motion.speed < MOVING) return;
    if (!stepDue(steps.current, motion.travelled, motion.gait)) return;
    audio.footstep(stepWeight(motion.gait), steps.current.left);
  });

  return null;
}
