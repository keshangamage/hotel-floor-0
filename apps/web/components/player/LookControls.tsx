import { PointerLockControls } from "@react-three/drei";
import { useCallback } from "react";

import { input } from "@/game/systems/input";
import { useGameStore } from "@/store/useGameStore";

/** Below 1 the default 0.002 rad/px feels twitchy at 72 degrees fov. */
const POINTER_SPEED = 0.8;

/**
 * Mouse look. These controls only touch camera.quaternion, so the player
 * controller stays free to own camera.position in step 5.
 */
export function LookControls() {
  const setPhase = useGameStore((state) => state.setPhase);

  const onLock = useCallback(() => setPhase("playing"), [setPhase]);
  const onUnlock = useCallback(() => {
    // Escape does not blur the window, so held keys must be dropped here.
    input.clear();
    setPhase("paused");
  }, [setPhase]);

  return (
    <PointerLockControls
      // Without a selector drei locks on any click anywhere in the document.
      selector="#pointer-lock-target"
      pointerSpeed={POINTER_SPEED}
      onLock={onLock}
      onUnlock={onUnlock}
    />
  );
}
