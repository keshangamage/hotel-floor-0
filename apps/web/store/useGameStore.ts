import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_SEED } from "@/game/generation/generateFloor";
import type { NoteSpec } from "@/game/types";

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
  /**
   * Whether the lift has stopped answering.
   *
   * Set the moment the player first reaches floor zero. Until then the panel
   * works like any hotel's; afterwards no button lights, which is the whole
   * of the premise: they did not choose to be down here and cannot simply
   * press five to leave.
   */
  trapped: boolean;
  /** The note being read, or null. */
  reading: NoteSpec | null;
  flashlightOn: boolean;
  /** Master volume, 0 to 1. */
  volume: number;
  /** Multiplies the mouse look speed. */
  sensitivity: number;
  setVolume: (volume: number) => void;
  setSensitivity: (sensitivity: number) => void;
  setPhase: (phase: GamePhase) => void;
  setInteractPrompt: (prompt: string | null) => void;
  toggleLight: (id: string) => void;
  setFloorNumber: (floor: number) => void;
  toggleFlashlight: () => void;
  readNote: (note: NoteSpec | null) => void;
  setTrapped: () => void;
}

/**
 * Discrete, low-frequency state only. Player position and velocity stay in refs:
 * pushing them through the store would re-render the tree 60 times a second.
 */
export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      phase: "menu",
      floorNumber: 5,
      seed: DEFAULT_SEED,
      interactPrompt: null,
      lightsOff: {},
      pausedAt: 0,
      trapped: false,
      reading: null,
      flashlightOn: false,
      volume: 0.7,
      sensitivity: 1,
      setVolume: (volume) => set({ volume }),
      setSensitivity: (sensitivity) => set({ sensitivity }),
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
      readNote: (reading) => set({ reading }),
      // Once only, and never undone: the lift does not start working again.
      setTrapped: () => set({ trapped: true }),
    }),
    {
      name: "hotel-floor-0",
      version: 1,
      // Next renders this on the server, where there is no saved run. Hydrating
      // during store creation would make the first client render disagree with
      // the server's HTML, so the shell rehydrates after mount instead.
      skipHydration: true,
      /**
       * The run, the tally and the settings.
       *
       * Phase and the note being held describe this moment rather than this
       * run: restoring them would drop the player into a paused menu holding a
       * piece of paper.
       *
       * The trap is saved: a player who reloads while stuck on floor zero is
       * still stuck on it.
       */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<GameState>;
        return {
          ...current,
          ...saved,
        };
      },
      partialize: (state) => ({
        seed: state.seed,
        floorNumber: state.floorNumber,
        trapped: state.trapped,
        volume: state.volume,
        sensitivity: state.sensitivity,
      }),
    },
  ),
);
