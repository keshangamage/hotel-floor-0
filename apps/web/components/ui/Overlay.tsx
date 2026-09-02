"use client";

import { useEffect, useState } from "react";

import { REFERENCE_FLOOR } from "@/game/systems/anomaly";
import { useGameStore } from "@/store/useGameStore";

/** Browsers refuse requestPointerLock for about a second after Escape. */
const RELOCK_COOLDOWN_MS = 1300;

const CONTROLS = [
  ["WASD", "Move"],
  ["Shift", "Sprint"],
  ["Ctrl", "Crouch"],
  ["E", "Interact"],
  ["F", "Flashlight"],
  ["Q", "Write down this floor"],
  ["R", "Read the notebook"],
  ["`", "Frame rate"],
  ["Esc", "Pause"],
];

/**
 * Stays mounted at all times: drei resolves the pointer-lock selector once, so
 * unmounting this would leave its click handler on a detached node.
 */
export function Overlay() {
  const phase = useGameStore((state) => state.phase);
  const pausedAt = useGameStore((state) => state.pausedAt);
  const volume = useGameStore((state) => state.volume);
  const sensitivity = useGameStore((state) => state.sensitivity);
  const setVolume = useGameStore((state) => state.setVolume);
  const setSensitivity = useGameStore((state) => state.setSensitivity);
  const [armedAt, setArmedAt] = useState(0);

  // What the save holds. The game has been quietly keeping a run across
  // reloads since the beginning and never said so, and there was no way to
  // leave one except by finishing it.
  const floorNumber = useGameStore((state) => state.floorNumber);
  const visited = useGameStore((state) => state.visited);
  const trapped = useGameStore((state) => state.trapped);
  const restart = useGameStore((state) => state.restart);
  const underway = Object.keys(visited).length > 1 || floorNumber !== REFERENCE_FLOOR;

  // Armed is derived, and the timer is the only thing that sets state. Setting
  // it synchronously here would cascade renders.
  useEffect(() => {
    if (phase !== "paused") return;
    const timer = setTimeout(() => setArmedAt(pausedAt), RELOCK_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [phase, pausedAt]);

  const armed = phase !== "paused" || armedAt === pausedAt;
  // The ending draws its own screen, and the pause menu is not part of it.
  const playing = phase === "playing" || phase === "ending";
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

        {/* Said once, on the way in. Enough that a player knows what they are
            being asked to do, and not so much that it does the asking for
            them: which floor is wrong is never the game's to say. */}
        {phase === "menu" && !underway && (
          <p className="max-w-sm font-mono text-[0.62rem] leading-[2.1] tracking-[0.16em] text-neutral-600">
            You are a guest on the fifth floor.
            <span className="mt-2 block">
              The lift goes down. Every floor it opens on is the same floor,
              until one of them is not.
            </span>
          </p>
        )}

        {/* A run that is already going. Saying where it stopped is the only
            way the player learns the game kept it at all. */}
        {phase === "menu" && underway && (
          <p className="max-w-sm font-mono text-[0.62rem] leading-[2.1] tracking-[0.16em] text-neutral-600">
            {trapped
              ? `The lift left you on floor ${floorNumber}.`
              : `You left off on floor ${floorNumber}.`}
          </p>
        )}

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

        {/* The overlay is the pointer lock target, so a click that lands here
            would lock the pointer and shut the menu. Stop it at the slider. */}
        <div
          className="flex w-64 flex-col gap-3"
          onClick={(event) => event.stopPropagation()}
        >
          {[
            { label: "Volume", value: volume, set: setVolume, min: 0, max: 1, step: 0.05,
              read: `${Math.round(volume * 100)}%` },
            { label: "Look", value: sensitivity, set: setSensitivity, min: 0.3, max: 2.5, step: 0.05,
              read: `${sensitivity.toFixed(2)}\u00d7` },
          ].map((row) => (
            <label key={row.label} className="flex items-center gap-3">
              <span className="w-14 text-left font-mono text-[0.6rem] uppercase tracking-[0.2em] text-neutral-500">
                {row.label}
              </span>
              <input
                type="range"
                min={row.min}
                max={row.max}
                step={row.step}
                value={row.value}
                onChange={(event) => row.set(Number(event.target.value))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded bg-neutral-700 accent-neutral-300"
                disabled={!interactive}
              />
              <span className="w-10 text-right font-mono text-[0.6rem] tabular-nums text-neutral-600">
                {row.read}
              </span>
            </label>
          ))}
        </div>

        {/* The overlay is the pointer lock target, so a click that lands here
            would begin the run it is offering to throw away. */}
        {phase === "menu" && underway && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              restart();
            }}
            disabled={!interactive}
            className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-neutral-600 underline-offset-8 transition-colors hover:text-neutral-300 hover:underline"
          >
            Or begin a different hotel
          </button>
        )}

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
