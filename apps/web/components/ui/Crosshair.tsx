"use client";

import { useGameStore } from "@/store/useGameStore";

/** A dot, not a reticle. This is not a shooter. */
export function Crosshair() {
  const playing = useGameStore((state) => state.phase === "playing");

  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      <span
        className={[
          "h-[3px] w-[3px] rounded-full bg-neutral-200 transition-opacity duration-500",
          playing ? "opacity-40" : "opacity-0",
        ].join(" ")}
      />
    </div>
  );
}
