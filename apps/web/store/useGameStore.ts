import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_SEED } from "@/game/generation/generateFloor";
import { floorAtDepth, type Verdict } from "@/game/systems/descent";
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
  /** Deepest ever reached, across every attempt. Something to beat. */
  best: number;
  /** Runs carried all the way to floor zero. */
  finished: number;
  /** How the last call went, for the message on arrival. Null before the first. */
  lastCall: {
    readonly correct: boolean;
    readonly won: boolean;
    /** What was wrong with the floor just judged, or null if nothing was. */
    readonly was: string | null;
  } | null;
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
  recordCall: (verdict: Verdict, was: string | null) => void;
  readNote: (note: NoteSpec | null) => void;
  beginAgain: () => void;
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
      depth: 0,
      best: 0,
      finished: 0,
      lastCall: null,
      reading: null,
      pendingSeed: null,
      flashlightOn: false,
      volume: 0.7,
      sensitivity: 1,
      setVolume: (volume) => set({ volume }),
      setSensitivity: (sensitivity) => set({ sensitivity }),
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
      readNote: (reading) => set({ reading }),
      // Starting over after finishing. Unlike a failed call this says nothing
      // on arrival: the player chose it, so there is nothing to tell them.
      beginAgain: () => set({ depth: 0, lastCall: null, pendingSeed: freshSeed() }),
      // The floor itself changes on arrival, not here: the car is still moving.
      recordCall: (verdict, was) =>
        set((state) => ({
          depth: verdict.depth,
          best: Math.max(state.best, verdict.depth),
          finished: state.finished + (verdict.won ? 1 : 0),
          lastCall: { correct: verdict.correct, won: verdict.won, was },
          // A wrong call starts a different hotel. Keeping the same one would
          // let the player remember which floors they had already cleared and
          // walk straight back down through them.
          pendingSeed: verdict.correct ? null : freshSeed(),
        })),
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
       * The queued seed is saved, though. A wrong call queues a fresh hotel
       * and the car takes a couple of seconds to carry the player back, and a
       * reload inside that window used to leave them restarting the very
       * building they had just learned.
       */
      /**
       * Depth is the record of progress; the floor is derived from it.
       *
       * They move at different moments: depth changes when the player presses,
       * the floor when the car arrives. A save taken between the two has them
       * out of step, and restoring both verbatim leaves the player standing on
       * one floor with the progress of another, skipping a floor on their next
       * right answer.
       */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<GameState>;
        const depth = saved.depth ?? current.depth;
        return {
          ...current,
          ...saved,
          depth,
          floorNumber: floorAtDepth(depth),
          // A queued hotel is taken up here rather than waiting for an arrival
          // that will never come, since restoring lands the player at rest.
          seed: saved.pendingSeed ?? saved.seed ?? current.seed,
          pendingSeed: null,
        };
      },
      partialize: (state) => ({
        seed: state.seed,
        depth: state.depth,
        floorNumber: state.floorNumber,
        best: state.best,
        finished: state.finished,
        pendingSeed: state.pendingSeed,
        volume: state.volume,
        sensitivity: state.sensitivity,
      }),
    },
  ),
);
