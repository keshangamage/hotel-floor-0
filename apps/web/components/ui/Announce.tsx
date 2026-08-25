"use client";

import { useGameStore } from "@/store/useGameStore";

/**
 * The only thing the game says out loud.
 *
 * Keyed on the floor rather than the call, so it speaks when the doors open
 * and not while the car is still moving, which would give the answer away
 * before the player arrives. Remounting on that key replays the fade, so the
 * message needs no timer and no state of its own.
 */
export function Announce() {
  const floorNumber = useGameStore((state) => state.floorNumber);
  const lastCall = useGameStore((state) => state.lastCall);

  if (!lastCall) return null;
  // A correct call speaks for itself: the floor number went down.
  const text = lastCall.won
    ? "Floor zero"
    : lastCall.correct
      ? null
      : "You are back on five";
  if (!text) return null;

  return (
    <p
      key={floorNumber}
      className={[
        "announce pointer-events-none absolute inset-x-0 top-[38%] z-10 text-center",
        "font-mono text-[0.7rem] uppercase tracking-[0.45em]",
        lastCall.won ? "text-neutral-200" : "text-neutral-500",
      ].join(" ")}
    >
      {text}
    </p>
  );
}
