import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { FOOTSTEPS } from "@/game/data/footsteps.generated";
import { CORRIDOR_HALF_WIDTH } from "@/game/data/dimensions";
import { generateFloor } from "@/game/generation/generateFloor";
import { depthOf } from "@/game/systems/ambience";
import { audio, type ToneVoice } from "@/game/systems/audio";
import { createStepTracker, stepDue, stepWeight } from "@/game/systems/footsteps";
import { motion } from "@/game/systems/motion";
import { useGameStore } from "@/store/useGameStore";

/** Below this the player is shuffling against a wall, not walking. */
const MOVING = 0.35;
/** How far behind the player the other footsteps land, in metres and seconds. */
const FOLLOW_DISTANCE = 2.6;
const FOLLOW_DELAY = 0.34;
/**
 * Steps that land after the player has stopped.
 *
 * Following that stops when you stop is indistinguishable from your own feet,
 * and a player will talk themselves out of it. Something that takes two more
 * steps and then stops is the whole anomaly.
 */
const TRAILING = [0.34, 0.78];
/**
 * Seconds between bursts of knocking.
 *
 * It has to repeat. An event heard once and missed is one the player cannot
 * go back and check, and the whole game is built on being able to check.
 */
const KNOCK_EVERY = 8;

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
  const tone = useRef<ToneVoice | null>(null);

  // Some floors are wrong in ways only the ear catches. Regenerating the plan
  // here is cheap and deterministic, and keeps this out of the store.
  const anomaly = useMemo(() => generateFloor(floorNumber, seed).anomaly, [floorNumber, seed]);
  const volume = useGameStore((state) => state.volume);
  const silent = anomaly?.kind === "silence";
  const followed = anomaly?.kind === "following";

  // Which door it comes from, fixed for the floor so the player can walk to it
  // and be sure. Behind a locked one, so there is no way to look.
  const knockAt = useMemo(() => {
    if (anomaly?.kind !== "knocking") return null;
    const spec = generateFloor(floorNumber, seed);
    const shut = spec.rooms.filter((r) => r.door === "locked");
    const room = shut[anomaly.target % Math.max(1, shut.length)];
    if (!room) return null;
    return [room.side * CORRIDOR_HALF_WIDTH, 1.05, room.doorZ] as const;
  }, [anomaly, floorNumber, seed]);

  const sinceKnock = useRef(KNOCK_EVERY - 2);
  const wasMoving = useRef(false);

  useEffect(() => {
    if (phase !== "playing") return;
    // A floor with no room tone at all. The absence is the anomaly, and it
    // only registers because every other floor has one.
    if (silent) return;

    let cancelled = false;
    // The click that locked the pointer is the gesture the context needs.
    void audio.resume().then(() => {
      if (cancelled) return;
      // Read rather than watched: adding the floor to this effect's deps would
      // restart the tone on every ride instead of sliding it.
      tone.current = audio.roomTone(1, depthOf(useGameStore.getState().floorNumber));
      // Failure here is not fatal: steps fall back to being synthesised.
      void audio.loadFootsteps("/audio/footsteps.wav", FOOTSTEPS)
        .catch((error: unknown) => console.warn("footstep samples unavailable", error));
      void audio.loadClip("door", "/audio/door.wav")
        .catch((error: unknown) => console.warn("door sample unavailable", error));
    });

    return () => {
      cancelled = true;
      tone.current?.stop();
      tone.current = null;
    };
  }, [phase, silent]);

  // Deeper floors are duller and heavier. Slid rather than restarted, so a ride
  // down is one continuous sound instead of a tone stopping and another
  // starting, which would read as an edit.
  useEffect(() => {
    tone.current?.depth(depthOf(floorNumber));
  }, [floorNumber]);

  // Applied here rather than in the slider, so it also lands once the context
  // has actually started.
  useEffect(() => {
    audio.setVolume(volume);
  }, [volume, phase]);

  useFrame((_, delta) => {
    // The room tone is stopped by the effect above when the game is paused,
    // but everything driven from here has to stop too, or a paused hotel
    // carries on knocking at an empty corridor.
    if (!audio.running || phase !== "playing") return;

    if (knockAt) {
      sinceKnock.current += Math.min(delta, 0.05);
      if (sinceKnock.current >= KNOCK_EVERY) {
        sinceKnock.current = 0;
        audio.knock(knockAt);
      }
    }

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

    const moving = motion.grounded && motion.speed >= MOVING;

    // The moment the player stops is the moment it gives itself away.
    if (followed && wasMoving.current && !moving) {
      behind.copy(camera.position).addScaledVector(forward, -FOLLOW_DISTANCE);
      const at: [number, number, number] = [behind.x, behind.y - 0.9, behind.z];
      for (const delay of TRAILING) audio.echoStep(delay, at);
    }
    wasMoving.current = moving;

    if (!moving) return;
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
