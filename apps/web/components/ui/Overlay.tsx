"use client";

import { useEffect, useState } from "react";

import { useGameStore } from "@/store/useGameStore";

/** Browsers refuse requestPointerLock for about a second after Escape. */
const RELOCK_COOLDOWN_MS = 1300;

const CONTROLS = [
  ["WASD", "Move"],
  ["Shift", "Sprint"],
  ["Ctrl", "Crouch"],
  ["E", "Interact"],
  ["F", "Flashlight"],
  ["Esc", "Pause"],
];

/**
 * Stays mounted at all times: drei resolves the pointer-lock selector once, so
 * unmounting this would leave its click handler on a detached node.
 */
export function Overlay() {
  const phase = useGameStore((state) => state.phase);
  const pausedAt = useGameStore((state) => state.pausedAt);
  const [armedAt, setArmedAt] = useState(0);

  // Armed is derived, and the timer is the only thing that sets state. Setting
  // it synchronously here would cascade renders.
  useEffect(() => {
    if (phase !== "paused") return;
    const timer = setTimeout(() => setArmedAt(pausedAt), RELOCK_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [phase, pausedAt]);

  const armed = phase !== "paused" || armedAt === pausedAt;
  const playing = phase === "playing";
  const interactive = !playing && armed;

  return (
    <div
      id="pointer-lock-target"
      className={[
        "absolute inset-0 z-20 grid place-items-center bg-black/85 backdrop-blur-[2px]",
        "transition-opacity duration-700",
        playing ? "pointer-events-none opacity-0" : "opacity-100",
        interactive ? "cursor-pointer" : "pointer-events-none",
      ].join(" ")}
    >
      <div className="flex flex-col items-center gap-10 px-6 text-center">
        <h1 className="font-mono text-2xl font-light uppercase tracking-[0.55em] text-neutral-300 sm:text-3xl">
          Hotel Floor 0
        </h1>

        <p
          className={[
            "font-mono text-[0.7rem] uppercase tracking-[0.3em] transition-opacity duration-500",
            interactive ? "text-neutral-400 opacity-100" : "text-neutral-600 opacity-60",
          ].join(" ")}
        >
          {phase === "menu"
            ? "Click to begin"
            : armed
              ? "Click to resume"
              : "Paused"}
        </p>

        <dl className="grid grid-cols-[auto_auto] gap-x-5 gap-y-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-neutral-700">
          {CONTROLS.map(([key, label]) => (
            <div key={key} className="contents">
              <dt className="text-right text-neutral-500">{key}</dt>
              <dd className="text-left">{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
