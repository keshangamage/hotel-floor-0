import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_SEED } from "@/game/generation/generateFloor";
import { REFERENCE_FLOOR } from "@/game/systems/anomaly";
import type { NoteSpec } from "@/game/types";

export type GamePhase = "menu" | "playing" | "paused" | "ending";

interface GameState {
  phase: GamePhase;
  /** The floor the player is actually on. Changes only on arrival. */
  floorNumber: number;
  /** Drives procedural generation; the same seed rebuilds the same hotel. */
  seed: string;
  /** Verb for whatever the crosshair is on, or null. */
  interactPrompt: string | null;
  /**
   * What the player is carrying. Keys are named for the door they open.
   *
   * Kept in the store rather than on the floor layout because it outlives the
   * floor: the whole point of picking something up is that it comes with you
   * when the lift doors close.
   */
  carrying: Readonly<Record<string, true>>;
  /** Doors opened with a key. A door does not lock itself again. */
  unlocked: Readonly<Record<string, true>>;
  /**
   * Floors the player has written down as wrong, and floors they have walked.
   *
   * The anomalies are the largest thing in the game and until now the player
   * could only look at them. This is what they can do about one: say so, and
   * be told at the end whether they were right. Keyed by floor as a string,
   * because that is what a saved object holds anyway.
   */
  marked: Readonly<Record<string, true>>;
  visited: Readonly<Record<string, true>>;
  /** Things used up where they were found, by instance. */
  spent: Readonly<Record<string, true>>;
  /**
   * What is left in the torch, 1 to 0.
   *
   * Written coarsely rather than every frame: the beam reads its own value
   * from a ref, and this is the copy that survives a reload and drives the
   * warning. Pushing 60 updates a second through the store would re-render the
   * tree for a number that changes in the third decimal place.
   */
  torch: number;
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
  /**
   * The one floor a dead lift will still take. Null while it takes none.
   *
   * The way on is never back up. Something found on a floor makes the lift
   * offer the next one down, and only that one, so the hotel is always the
   * thing deciding where the player goes.
   */
  offered: number | null;
  /**
   * Bumped to start a new run. The scene is keyed on it, so everything holding
   * position - the player, the car, the doors - is rebuilt rather than left
   * standing where the last run ended.
   */
  run: number;
  /** The note being read, or null. */
  reading: NoteSpec | null;
  flashlightOn: boolean;
  /** Frame timing on screen. Off by default, and not saved. */
  showStats: boolean;
  /** Master volume, 0 to 1. */
  volume: number;
  /** Multiplies the mouse look speed. */
  sensitivity: number;
  setVolume: (volume: number) => void;
  setSensitivity: (sensitivity: number) => void;
  setPhase: (phase: GamePhase) => void;
  setInteractPrompt: (prompt: string | null) => void;
  toggleLight: (id: string) => void;
  take: (id: string) => void;
  unlock: (id: string) => void;
  spend: (id: string) => void;
  mark: (floor: number) => void;
  setTorch: (charge: number) => void;
  recharge: () => void;
  setFloorNumber: (floor: number) => void;
  toggleFlashlight: () => void;
  toggleStats: () => void;
  readNote: (note: NoteSpec | null) => void;
  setTrapped: () => void;
  offer: (floor: number) => void;
  finish: () => void;
  restart: () => void;
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
      carrying: {},
      unlocked: {},
      spent: {},
      marked: {},
      visited: {},
      torch: 1,
      lightsOff: {},
      pausedAt: 0,
      trapped: false,
      offered: null,
      run: 0,
      reading: null,
      flashlightOn: false,
      showStats: false,
      volume: 0.7,
      sensitivity: 1,
      setVolume: (volume) => set({ volume }),
      setSensitivity: (sensitivity) => set({ sensitivity }),
      /**
       * Any change of phase puts down whatever was being read.
       *
       * Escape is the browser leaving pointer lock rather than a key the game
       * is ever told about, so pausing with a page held used to leave it held:
       * it is drawn over the pause menu, and the key that puts it down is only
       * read while playing. There was no way out of that but a reload.
       */
      setPhase: (phase) =>
        set(phase === "paused"
          ? { phase, pausedAt: Date.now(), reading: null }
          : { phase, reading: null }),
      setInteractPrompt: (interactPrompt) => set({ interactPrompt }),
      // Arriving is what counts as walking a floor, so the tally at the end
      // can tell a floor missed from one never reached.
      setFloorNumber: (floorNumber) =>
        set((state) => ({
          floorNumber,
          visited: { ...state.visited, [String(floorNumber)]: true },
        })),
      take: (id) => set((state) => ({ carrying: { ...state.carrying, [id]: true } })),
      unlock: (id) => set((state) => ({ unlocked: { ...state.unlocked, [id]: true } })),
      spend: (id) => set((state) => ({ spent: { ...state.spent, [id]: true } })),
      // Written down, or crossed out again: a player who changes their mind
      // about a floor is doing the thing the game is about.
      mark: (floor) =>
        set((state) => {
          const next = { ...state.marked };
          const at = String(floor);
          if (next[at]) delete next[at];
          else next[at] = true;
          return { marked: next };
        }),
      setTorch: (torch) => set({ torch }),
      recharge: () => set({ torch: 1 }),
      toggleLight: (id) =>
        set((state) => {
          const next = { ...state.lightsOff };
          if (next[id]) delete next[id];
          else next[id] = true;
          return { lightsOff: next };
        }),
      // A flat torch does not come on, and saying so is the switch clicking
      // and nothing happening, which is what a flat torch does.
      toggleFlashlight: () =>
        set((state) => ({ flashlightOn: state.flashlightOn ? false : state.torch > 0 })),
      toggleStats: () => set((state) => ({ showStats: !state.showStats })),
      readNote: (reading) => set({ reading }),
      // Once only, and never undone: the lift does not start working again.
      setTrapped: () => set({ trapped: true }),
      // Only ever downward, and only one at a time.
      offer: (floor) => set((state) => (state.offered !== null && floor >= state.offered
        ? {}
        : { offered: floor })),
      // The same, for the one phase that is not set through setPhase: the lift
      // can arrive at G while the notebook is open.
      finish: () => set({ phase: "ending", reading: null }),
      // A new hotel, not the same one again: the run that just ended is the
      // only one that building gets.
      restart: () => set((state) => ({
        phase: "menu",
        seed: Math.random().toString(36).slice(2, 10),
        floorNumber: REFERENCE_FLOOR,
        trapped: false,
        offered: null,
        lightsOff: {},
        carrying: {},
        unlocked: {},
        spent: {},
        marked: {},
        visited: {},
        torch: 1,
        reading: null,
        interactPrompt: null,
        run: state.run + 1,
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
        carrying: state.carrying,
        unlocked: state.unlocked,
        spent: state.spent,
        marked: state.marked,
        visited: state.visited,
        torch: state.torch,
        trapped: state.trapped,
        offered: state.offered,
        volume: state.volume,
        sensitivity: state.sensitivity,
      }),
    },
  ),
);
