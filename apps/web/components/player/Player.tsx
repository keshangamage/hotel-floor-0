import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import {
  CROUCH_EYE_HEIGHT,
  CROUCH_HEIGHT,
  EYE_HEIGHT,
  PLAYER_HEIGHT,
} from "@/game/data/dimensions";
import { isClear, moveAndCollide } from "@/game/systems/collision";
import { createBob, headBob } from "@/game/systems/headbob";
import { input } from "@/game/systems/input";
import { motion } from "@/game/systems/motion";
import {
  applyGravity,
  horizontalSpeed,
  integrateHorizontal,
  type MoveIntent,
} from "@/game/systems/movement";
import { useColliders } from "@/components/game/Colliders";
import type { FloorLayout, Point3 } from "@/game/types";
import { useGameStore } from "@/store/useGameStore";

/** A backgrounded tab can hand back a huge delta; clamp before integrating. */
const MAX_DELTA = 0.05;
/** How fast the view rises and falls when crouching. */
const CROUCH_LERP = 12;

// Reused every frame so the loop stays allocation free.
const euler = new THREE.Euler(0, 0, 0, "YXZ");
const bob = createBob();
const delta: Point3 = { x: 0, y: 0, z: 0 };
const intent: MoveIntent = { forward: 0, strafe: 0, sprint: false, crouch: false };

export function Player({ layout }: { layout: FloorLayout }) {
  const camera = useThree((state) => state.camera);
  const colliders = useColliders().list;

  const position = useRef<Point3>({
    x: layout.spawn[0],
    y: layout.spawn[1],
    z: layout.spawn[2],
  });
  const velocity = useRef<Point3>({ x: 0, y: 0, z: 0 });
  const eyeHeight = useRef(EYE_HEIGHT);
  const travelled = useRef(0);
  const spawned = useRef(false);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, MAX_DELTA);
    const p = position.current;
    const v = velocity.current;

    // Face the spawn direction once, before the controls take over yaw.
    if (!spawned.current) {
      spawned.current = true;
      euler.set(0, layout.spawnYaw, 0);
      camera.quaternion.setFromEuler(euler);
    }

    // Reading holds the player still: the note covers the view, so walking
    // blind into a corridor would be the game's fault rather than theirs.
    const store = useGameStore.getState();
    const playing = store.phase === "playing" && store.reading === null;

    // Yaw comes from the camera, which PointerLockControls owns.
    euler.setFromQuaternion(camera.quaternion);
    const yaw = euler.y;

    const wantsCrouch = playing && input.isDown("crouch");
    const standing = { x: p.x, y: p.y, z: p.z };
    // Refuse to stand up into a ceiling.
    const canStand = isClear(standing, PLAYER_HEIGHT, colliders);
    const crouched = wantsCrouch || !canStand;
    const height = crouched ? CROUCH_HEIGHT : PLAYER_HEIGHT;

    const forward = playing ? input.axis("back", "forward") : 0;
    const strafe = playing ? input.axis("left", "right") : 0;
    Object.assign(intent, {
      forward,
      strafe,
      sprint: playing && input.isDown("sprint") && !crouched,
      crouch: crouched,
    });

    integrateHorizontal(v, intent, yaw, dt);

    const hit = moveAndCollide(
      p,
      Object.assign(delta, { x: v.x * dt, y: v.y * dt, z: v.z * dt }),
      height,
      colliders,
    );

    // Stop pushing into whatever we hit, so we do not stick to walls.
    if (hit.blockedX) v.x = 0;
    if (hit.blockedZ) v.z = 0;
    applyGravity(v, hit.grounded, dt);

    const speed = horizontalSpeed(v);
    travelled.current += speed * dt;
    headBob(travelled.current, speed, bob);

    // Published for anything mounted after this that needs the player's state
    // every frame, which is how footsteps stay in step with the legs.
    motion.travelled = travelled.current;
    motion.speed = speed;
    motion.grounded = hit.grounded;
    motion.gait = crouched ? "crouch" : intent.sprint ? "sprint" : "walk";
    motion.x = p.x;
    motion.y = p.y;
    motion.z = p.z;
    motion.height = height;

    const targetEye = crouched ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    eyeHeight.current += (targetEye - eyeHeight.current) * Math.min(1, CROUCH_LERP * dt);

    // Lateral bob rides the camera's right vector.
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    camera.position.set(
      p.x + bob.lateral * rightX,
      p.y + eyeHeight.current + bob.vertical,
      p.z + bob.lateral * rightZ,
    );

    // PointerLockControls preserves roll, so writing z here survives mouse look.
    euler.z = bob.roll;
    camera.quaternion.setFromEuler(euler);
  });

  return null;
}
