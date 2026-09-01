"use client";

import { useGameStore } from "@/store/useGameStore";

/**
 * The only thing the game says out loud.
 *
 * Keyed on the floor so it speaks when the doors open rather than while the
 * car is still moving. Remounting on that key replays the fade, so the message
 * needs no timer and no state of its own.
 */
export function Announce() {
  const floorNumber = useGameStore((state) => state.floorNumber);
  const trapped = useGameStore((state) => state.trapped);

  // Said once, when the doors open on a floor that should not exist.
  if (!trapped || floorNumber !== 0) return null;

  return (
    <p
      key={floorNumber}
      className={[
        "announce pointer-events-none absolute inset-x-0 top-[38%] z-10 text-center",
        "font-mono text-[0.7rem] uppercase tracking-[0.45em] text-neutral-400",
      ].join(" ")}
    >
      Floor zero
      <span className="mt-3 block text-[0.6rem] normal-case tracking-[0.3em] text-neutral-600">
        The hotel has five floors
      </span>
    </p>
  );
}
