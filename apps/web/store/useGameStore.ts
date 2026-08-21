import { create } from "zustand";

export type GamePhase = "menu" | "playing" | "paused";

interface GameState {
  phase: GamePhase;
  /** Shown on the elevator display. */
  floorNumber: number;
  /** Timestamp of the last pause, used to time the pointer-lock cooldown. */
  pausedAt: number;
  flashlightOn: boolean;
  setPhase: (phase: GamePhase) => void;
  toggleFlashlight: () => void;
}

/**
 * Discrete, low-frequency state only. Player position and velocity stay in refs:
 * pushing them through the store would re-render the tree 60 times a second.
 */
export const useGameStore = create<GameState>((set) => ({
  phase: "menu",
  floorNumber: 5,
  pausedAt: 0,
  flashlightOn: false,
  setPhase: (phase) =>
    set(phase === "paused" ? { phase, pausedAt: Date.now() } : { phase }),
  toggleFlashlight: () => set((state) => ({ flashlightOn: !state.flashlightOn })),
}));
