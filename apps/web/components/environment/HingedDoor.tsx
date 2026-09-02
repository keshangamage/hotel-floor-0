import { useFrame } from "@react-three/fiber";
import { useCallback, useMemo, useRef, useState } from "react";

import { useLookAway } from "@/components/horror/LookAway";
import * as THREE from "three";

import { useDynamicCollider } from "@/components/game/Colliders";
import { Interactable } from "@/components/interaction/Interactable";
import { audio } from "@/game/systems/audio";
import { doorFootprint, doorYaw, wouldHit } from "@/game/systems/doors";
import { motion } from "@/game/systems/motion";
import type { AABB, DoorSpec } from "@/game/types";
import { useGameStore } from "@/store/useGameStore";

import { FIXTURE_MATERIAL, MATERIALS, UNIT_BOX } from "./resources";

/** Seconds for a full swing. */
const SWING_TIME = 0.9;

// Where the swing is about to be, tested before it goes there. Shared by every
// door: it is written and read inside one frame callback and never outlives it.
const swept: AABB = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

export function HingedDoor({ spec }: { spec: DoorSpec }) {
  const pivot = useRef<THREE.Group>(null);
  const collider = useDynamicCollider();
  const progress = useRef(spec.startsOpen ? 1 : 0);
  const [open, setOpen] = useState(spec.startsOpen ?? false);

  // Roughly the middle of the leaf, at handle height. The hinge alone would put
  // a corridor door's creak half a metre into the wall.
  const source = useMemo<[number, number, number]>(
    () => [spec.hinge[0], 1.05, spec.hinge[2] + spec.width / 2],
    [spec.hinge, spec.width],
  );

  // The same place as the sound, in the shape the watcher wants.
  const watchAt = useMemo(
    () => ({ x: source[0], y: source[1], z: source[2] }),
    [source],
  );

  /**
   * A locked door that opens itself the moment nobody is watching it.
   *
   * Once only: a door that kept swinging would read as a mechanism, and the
   * whole of it is that the player passed a shut door and came back to an open
   * one. It uses the same swing as a door the player opens, so it is already
   * open by the time they turn round rather than caught in the act.
   */
  useLookAway(
    watchAt,
    () => {
      if (open) return;
      setOpen(true);
      audio.playAt("door", source, { rate: 0.84, gain: 0.75 });
    },
    spec.opensUnwatched === true,
  );

  // The door names what opens it, so there is no table to fall out of step.
  const carrying = useGameStore((state) => state.carrying);
  const unlockedDoors = useGameStore((state) => state.unlocked);
  const unlock = useGameStore((state) => state.unlock);
  const hasKey = spec.needs !== undefined && carrying[spec.needs] === true;
  const shut = spec.locked && !unlockedDoors[spec.id];

  const toggle = useCallback(() => {
    // Turning the key is the same motion as opening it: one press, not two.
    // A door that has to be unlocked and then opened reads as a mechanism.
    if (shut && hasKey) {
      unlock(spec.id);
      setOpen(true);
      audio.playAt("door", source, { rate: 0.92, gain: 0.95 });
      return;
    }
    if (shut) return;
    const next = !open;
    setOpen(next);
    // Closing drags the same hinge the other way, so it is the same creak a
    // little lower and heavier.
    audio.playAt("door", source, { rate: next ? 1 : 0.88, gain: next ? 0.9 : 1 });
  }, [shut, hasKey, unlock, spec.id, open, source]);

  const prompt = shut
    ? (hasKey ? "Unlock" : "Locked")
    : open ? "Close" : "Open";

  useFrame((_, delta) => {
    // A swing carries its collider with it, so letting one finish during a
    // pause moves solid geometry while the player is in the menu.
    if (useGameStore.getState().phase !== "playing") return;

    const target = open ? 1 : 0;
    const step = Math.min(delta, 0.05) / SWING_TIME;
    let next = progress.current;
    if (next < target) next = Math.min(target, next + step);
    else if (next > target) next = Math.max(target, next - step);

    // A door meeting a person stops against them. It carries its collider with
    // it, and one that closes around somebody puts them on top of it and then
    // walks them out through the side of the building. The swing is held
    // rather than refused, so it carries on by itself the moment they step
    // out of the way.
    if (!wouldHit(doorFootprint(spec, doorYaw(spec, next), swept), motion, motion.height)) {
      progress.current = next;
    }

    // Written every frame either way, so what is drawn and what is solid are
    // the same door even on the frames it is not allowed to move.
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
