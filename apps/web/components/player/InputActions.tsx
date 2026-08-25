import { useFrame } from "@react-three/fiber";

import { input } from "@/game/systems/input";
import { useGameStore } from "@/store/useGameStore";

/**
 * Applies one-shot key presses to game state. Reads the store with getState()
 * rather than a hook so this never subscribes and never re-renders.
 */
export function InputActions() {
  useFrame(() => {
    const { phase, toggleFlashlight, reading, readNote } = useGameStore.getState();
    if (phase !== "playing") return;

    // A note is put down with the same key that picked it up. Consuming the
    // press here is what stops the driver seeing it and opening it again.
    if (reading) {
      if (input.consumePress("interact")) readNote(null);
      return;
    }

    if (input.consumePress("flashlight")) toggleFlashlight();
  });

  return null;
}
