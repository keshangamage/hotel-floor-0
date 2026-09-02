"use client";

import { FAILING } from "@/game/systems/torch";
import { useGameStore } from "@/store/useGameStore";

/**
 * What the player is holding, in the corner.
 *
 * A key is only useful if you remember you have it, and this game takes it
 * across floors and through a save. Nothing else about the interface tells
 * them, and a locked door that could be opened is worse than one that cannot.
 */
export function Carrying() {
  const carrying = useGameStore((state) => state.carrying);
  const phase = useGameStore((state) => state.phase);
  const torch = useGameStore((state) => state.torch);
  const marked = useGameStore((state) => state.marked);
  const floorNumber = useGameStore((state) => state.floorNumber);
  const written = marked[String(floorNumber)] === true;
  const held = Object.keys(carrying);
  // Said only once it is worth saying. A meter that is always on screen is a
  // number the player watches instead of the corridor.
  const failing = torch < FAILING;

  if (phase !== "playing" || (held.length === 0 && !failing)) return null;

  return (
    <ul className="pointer-events-none absolute bottom-6 left-6 z-10 space-y-1">
      {held.map((id) => (
        <li
          key={id}
          className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-neutral-500"
        >
          {id === "key-guest" ? "Room key" : id === "ledger" ? "Notebook  ·  Q  R" : id}
        </li>
      ))}
      {written && (
        <li className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-neutral-300">
          This floor is written down
        </li>
      )}
      {failing && (
        <li className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-neutral-400">
          {torch > 0 ? "The torch is going" : "The torch is dead"}
        </li>
      )}
    </ul>
  );
}
