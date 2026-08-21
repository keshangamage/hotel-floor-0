import { useFrame } from "@react-three/fiber";

import { input } from "@/game/systems/input";
import { useGameStore } from "@/store/useGameStore";

/**
 * Applies one-shot key presses to game state. Reads the store with getState()
 * rather than a hook so this never subscribes and never re-renders.
 */
export function InputActions() {
  useFrame(() => {
    const { phase, toggleFlashlight } = useGameStore.getState();
    if (phase !== "playing") return;
    if (input.consumePress("flashlight")) toggleFlashlight();
  });

  return null;
}
