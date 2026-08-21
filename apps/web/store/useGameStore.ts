import { create } from "zustand";

import { DEFAULT_SEED } from "@/game/generation/generateFloor";

export type GamePhase = "menu" | "playing" | "paused";

interface GameState {
  phase: GamePhase;
  /** The floor the player is actually on. Changes only on arrival. */
  floorNumber: number;
  /** Drives procedural generation; the same seed rebuilds the same hotel. */
  seed: string;
  /** Verb for whatever the crosshair is on, or null. */
  interactPrompt: string | null;
  /** Lights that have been switched off. Absent means on. */
  lightsOff: Readonly<Record<string, true>>;
  /** Timestamp of the last pause, used to time the pointer-lock cooldown. */
  pausedAt: number;
  flashlightOn: boolean;
  setPhase: (phase: GamePhase) => void;
  setInteractPrompt: (prompt: string | null) => void;
  toggleLight: (id: string) => void;
  setFloorNumber: (floor: number) => void;
  toggleFlashlight: () => void;
}

/**
 * Discrete, low-frequency state only. Player position and velocity stay in refs:
 * pushing them through the store would re-render the tree 60 times a second.
 */
export const useGameStore = create<GameState>((set) => ({
  phase: "menu",
  floorNumber: 5,
  seed: DEFAULT_SEED,
  interactPrompt: null,
  lightsOff: {},
  pausedAt: 0,
  flashlightOn: false,
  setPhase: (phase) =>
    set(phase === "paused" ? { phase, pausedAt: Date.now() } : { phase }),
  setInteractPrompt: (interactPrompt) => set({ interactPrompt }),
  setFloorNumber: (floorNumber) => set({ floorNumber }),
  toggleLight: (id) =>
    set((state) => {
      const next = { ...state.lightsOff };
      if (next[id]) delete next[id];
      else next[id] = true;
      return { lightsOff: next };
    }),
  toggleFlashlight: () => set((state) => ({ flashlightOn: !state.flashlightOn })),
}));
