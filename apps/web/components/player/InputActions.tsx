import { useFrame } from "@react-three/fiber";

import { LEDGER } from "@/game/data/floor";
import { input } from "@/game/systems/input";
import { notebookPage } from "@/game/systems/ledger";
import { useGameStore } from "@/store/useGameStore";

/**
 * Applies one-shot key presses to game state. Reads the store with getState()
 * rather than a hook so this never subscribes and never re-renders.
 */
export function InputActions() {
  useFrame(() => {
    const state = useGameStore.getState();
    const { phase, toggleFlashlight, reading, readNote } = state;
    if (phase !== "playing") return;

    // A note is put down with the same key that picked it up. Consuming the
    // press here is what stops the driver seeing it and opening it again.
    if (reading) {
      if (input.consumePress("interact")) readNote(null);
      return;
    }

    if (input.consumePress("flashlight")) toggleFlashlight();
    if (input.consumePress("stats")) state.toggleStats();

    // Only with the notebook in hand. Without it there is nothing to write in,
    // and a player who never found it is not quietly keeping a tally anyway.
    if (input.consumePress("record") && state.carrying[LEDGER]) {
      state.mark(state.floorNumber);
    }

    // Reading it back. Seven floors is more than anybody holds in their head,
    // and a record you cannot check is not a record.
    if (input.consumePress("review") && state.carrying[LEDGER]) {
      state.readNote(notebookPage(state.visited, state.marked));
    }
  });

  return null;
}
