import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";

import { ENDING_FLOOR } from "@/game/systems/anomaly";
import type { FloorLayout, FloorSpec } from "@/game/types";
import { useGameStore } from "@/store/useGameStore";

/**
 * How far past a lamp the player has to be before it goes.
 *
 * Far enough to be behind them in a corridor this dark, so what they see is
 * that it has gone rather than the moment it went. A light that snapped off in
 * view would be a switch being thrown at them; one that is simply not there
 * when they turn round is the floor closing up.
 */
const BEHIND = 6;

/**
 * Floor zero putting itself out.
 *
 * This floor is never judged. Nothing here has to match anything, which makes
 * it the one place besides the lift where the game can do as it likes: the
 * whole comparison rests on the other floors being identical, and no amount of
 * this could be mistaken for a fault the player is meant to write down.
 *
 * The walk in is thirty five metres towards the only lit thing on the floor.
 * The walk back is the same thirty five metres with the pools gone, which is
 * the first time the torch has been the difference between seeing and not.
 */
export function GoingOut({ spec, layout }: { spec: FloorSpec; layout: FloorLayout }) {
  const camera = useThree((state) => state.camera);
  const toggleLight = useGameStore((state) => state.toggleLight);

  // Only the named ones. The lamp over the page is left out on purpose.
  const pools = useMemo(
    () => layout.lamps
      .filter((lamp) => lamp.id?.startsWith("ground-") && lamp.lit !== false)
      .map((lamp) => ({ id: lamp.id!, z: lamp.position[2] })),
    [layout],
  );
  const done = useRef(new Set<string>());

  useFrame(() => {
    if (spec.floorNumber !== ENDING_FLOOR) return;
    if (useGameStore.getState().phase !== "playing") return;

    const { lightsOff } = useGameStore.getState();
    for (const pool of pools) {
      if (done.current.has(pool.id) || lightsOff[pool.id]) continue;
      // Walked past it, going away from the lift.
      if (camera.position.z > pool.z - BEHIND) continue;
      done.current.add(pool.id);
      toggleLight(pool.id);
    }
  });

  return null;
}
