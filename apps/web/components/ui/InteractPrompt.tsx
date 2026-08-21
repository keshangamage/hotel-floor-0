"use client";

import { useGameStore } from "@/store/useGameStore";

/** Shows the key and the verb when the crosshair is on something usable. */
export function InteractPrompt() {
  const prompt = useGameStore((state) => state.interactPrompt);
  const playing = useGameStore((state) => state.phase === "playing");
  const visible = playing && prompt !== null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[38%] z-10 flex justify-center">
      <div
        className={[
          "flex items-center gap-2.5 font-mono text-[0.7rem] uppercase tracking-[0.25em]",
          "transition-opacity duration-200",
          visible ? "opacity-90" : "opacity-0",
        ].join(" ")}
      >
        <span className="grid h-5 w-5 place-items-center rounded-[3px] border border-neutral-400/70 text-[0.65rem] text-neutral-200">
          E
        </span>
        <span className="text-neutral-300">{prompt ?? ""}</span>
      </div>
    </div>
  );
}
