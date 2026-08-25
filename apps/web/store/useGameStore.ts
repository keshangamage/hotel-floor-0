import { create } from "zustand";

import { DEFAULT_SEED } from "@/game/generation/generateFloor";
import type { Verdict } from "@/game/systems/descent";
import type { NoteSpec } from "@/game/types";

export type GamePhase = "menu" | "playing" | "paused";

/** A different hotel for every attempt. */
const freshSeed = () => Math.random().toString(36).slice(2, 10);

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
  /** How far down the player has got. 0 is the reference floor. */
  depth: number;
  /** How the last call went, for the message on arrival. Null before the first. */
  lastCall: { readonly correct: boolean; readonly won: boolean } | null;
  /** The note being read, or null. */
  reading: NoteSpec | null;
  /**
   * The hotel to rebuild with on arrival, or null to keep this one.
   *
   * Held rather than applied because a failed call is made with the doors
   * still open, and swapping the seed there would rebuild the corridor in
   * front of the player.
   */
  pendingSeed: string | null;
  flashlightOn: boolean;
  setPhase: (phase: GamePhase) => void;
  setInteractPrompt: (prompt: string | null) => void;
  toggleLight: (id: string) => void;
  setFloorNumber: (floor: number) => void;
  toggleFlashlight: () => void;
  recordCall: (verdict: Verdict) => void;
  readNote: (note: NoteSpec | null) => void;
  beginAgain: () => void;
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
  depth: 0,
  lastCall: null,
  reading: null,
  pendingSeed: null,
  flashlightOn: false,
  setPhase: (phase) =>
    set(phase === "paused" ? { phase, pausedAt: Date.now() } : { phase }),
  setInteractPrompt: (interactPrompt) => set({ interactPrompt }),
  // Arrival is where a new hotel takes effect: the doors are shut, so the
  // rebuild happens out of sight.
  setFloorNumber: (floorNumber) =>
    set((state) =>
      state.pendingSeed !== null
        ? { floorNumber, seed: state.pendingSeed, pendingSeed: null }
        : { floorNumber },
    ),
  toggleLight: (id) =>
    set((state) => {
      const next = { ...state.lightsOff };
      if (next[id]) delete next[id];
      else next[id] = true;
      return { lightsOff: next };
    }),
  toggleFlashlight: () => set((state) => ({ flashlightOn: !state.flashlightOn })),
  // The floor itself changes on arrival, not here: the car is still moving.
  readNote: (reading) => set({ reading }),
  // Starting over after finishing. Unlike a failed call this says nothing on
  // arrival: the player chose it, so there is nothing to tell them.
  beginAgain: () => set({ depth: 0, lastCall: null, pendingSeed: freshSeed() }),
  recordCall: (verdict) =>
    set({
      depth: verdict.depth,
      lastCall: { correct: verdict.correct, won: verdict.won },
      // A wrong call starts a different hotel. Keeping the same one would let
      // the player remember which floors they had already cleared and walk
      // straight back down through them.
      pendingSeed: verdict.correct ? null : freshSeed(),
    }),
}));
