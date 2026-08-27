import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { FOOTSTEPS } from "@/game/data/footsteps.generated";
import { generateFloor } from "@/game/generation/generateFloor";
import { audio } from "@/game/systems/audio";
import { createStepTracker, stepDue, stepWeight } from "@/game/systems/footsteps";
import { motion } from "@/game/systems/motion";
import { useGameStore } from "@/store/useGameStore";

/** Below this the player is shuffling against a wall, not walking. */
const MOVING = 0.35;
/** How far behind the player the other footsteps land, in metres and seconds. */
const FOLLOW_DISTANCE = 2.6;
const FOLLOW_DELAY = 0.34;

// Reused every frame so the loop stays allocation free.
const forward = new THREE.Vector3();
const behind = new THREE.Vector3();
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
  const floorNumber = useGameStore((state) => state.floorNumber);
  const seed = useGameStore((state) => state.seed);
  const camera = useThree((state) => state.camera);
  const steps = useRef(createStepTracker());

  // Some floors are wrong in ways only the ear catches. Regenerating the plan
  // here is cheap and deterministic, and keeps this out of the store.
  const anomaly = useMemo(() => generateFloor(floorNumber, seed).anomaly, [floorNumber, seed]);
  const volume = useGameStore((state) => state.volume);
  const silent = anomaly?.kind === "silence";
  const followed = anomaly?.kind === "following";

  useEffect(() => {
    if (phase !== "playing") return;
    // A floor with no room tone at all. The absence is the anomaly, and it
    // only registers because every other floor has one.
    if (silent) return;

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
  }, [phase, silent]);

  // Applied here rather than in the slider, so it also lands once the context
  // has actually started.
  useEffect(() => {
    audio.setVolume(volume);
  }, [volume, phase]);

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

    // Something walking a step behind, in the player's own footsteps.
    if (followed) {
      behind.copy(camera.position).addScaledVector(forward, -FOLLOW_DISTANCE);
      audio.echoStep(FOLLOW_DELAY, [behind.x, behind.y - 0.9, behind.z]);
    }
  });

  return null;
}
