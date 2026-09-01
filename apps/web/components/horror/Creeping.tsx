import { useMemo, useRef } from "react";
import * as THREE from "three";

import { Prop } from "@/components/environment/Prop";
import { createRandom } from "@/game/systems/random";
import type { PropSpec } from "@/game/types";

import { useLookAway } from "./LookAway";

/** How far it shifts each time, and how far it is ever allowed to get. */
const STEP = 0.13;
const LIMIT = 0.55;

/**
 * A piece of furniture that is not where it was.
 *
 * It only ever moves while the player is turned away, so they never catch it
 * moving, only notice that it has. Small steps and a hard limit: the point is
 * a chair that is not quite where it was, not one that has crossed the room,
 * and its collider does not follow it.
 */
export function Creeping({ spec }: { spec: PropSpec }) {
  const group = useRef<THREE.Group>(null);
  const drift = useRef({ x: 0, z: 0, turn: 0 });
  // Seeded from the instance, so the same chair creeps the same way twice.
  const random = useMemo(() => createRandom(`${spec.instanceId}:creep`), [spec.instanceId]);

  useLookAway(
    { x: spec.position[0], y: spec.position[1], z: spec.position[2] },
    () => {
      const d = drift.current;
      d.x = Math.max(-LIMIT, Math.min(LIMIT, d.x + random.float(-STEP, STEP)));
      d.z = Math.max(-LIMIT, Math.min(LIMIT, d.z + random.float(-STEP, STEP)));
      // A turn as well as a shift. A chair that slides without rotating reads
      // as a physics bug rather than as something having been moved.
      d.turn += random.float(-0.22, 0.22);

      if (!group.current) return;
      group.current.position.set(d.x, 0, d.z);
      group.current.rotation.y = d.turn;
    },
  );

  return (
    <group ref={group}>
      <Prop spec={spec} />
    </group>
  );
}
