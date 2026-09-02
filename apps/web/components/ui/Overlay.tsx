"use client";

import { useProgress } from "@react-three/drei";
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

type Panel = "main" | "settings" | "credits";

const LINK =
  "font-mono text-[0.62rem] uppercase tracking-[0.3em] text-neutral-600 underline-offset-8 transition-colors hover:text-neutral-300 hover:underline disabled:pointer-events-none disabled:opacity-40";

/**
 * The way in, and the way back in.
 *
 * Stays mounted at all times, and so does the button that locks the pointer:
 * drei resolves that selector once, so a button that came and went with the
 * panel would take its click handler with it. Sub-panels hide it rather than
 * unmounting it.
 */
export function Overlay() {
  const phase = useGameStore((state) => state.phase);
  const pausedAt = useGameStore((state) => state.pausedAt);
  const volume = useGameStore((state) => state.volume);
  const sensitivity = useGameStore((state) => state.sensitivity);
  const setVolume = useGameStore((state) => state.setVolume);
  const setSensitivity = useGameStore((state) => state.setSensitivity);
  const floorNumber = useGameStore((state) => state.floorNumber);
  const visited = useGameStore((state) => state.visited);
  const trapped = useGameStore((state) => state.trapped);
  const restart = useGameStore((state) => state.restart);

  const [armedAt, setArmedAt] = useState(0);
  const [panel, setPanel] = useState<Panel>("main");
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

  /**
   * The hotel is eleven megabytes and this is going on the web.
   *
   * Somebody on a slow connection who clicked straight through would walk a
   * corridor whose furniture arrived a piece at a time. The button says how
   * far along it is instead, and does not let them in until it is there.
   */
  const { active, progress } = useProgress();
  const loading = active && progress < 100;

  const begin = loading
    ? `Loading ${Math.round(progress)}%`
    : phase === "paused" ? "Resume" : underway ? "Continue" : "Start";

  return (
    <div
      className={[
        "absolute inset-0 z-20 grid place-items-center bg-black/85 backdrop-blur-[2px]",
        "transition-opacity duration-700",
        playing ? "pointer-events-none opacity-0" : "opacity-100",
      ].join(" ")}
    >
      <div className="flex flex-col items-center gap-9 px-6 text-center">
        <h1 className="font-mono text-2xl font-light uppercase tracking-[0.55em] text-neutral-300 sm:text-3xl">
          Hotel Floor 0
        </h1>

        {panel === "main" && (
          <p className="max-w-sm font-mono text-[0.62rem] leading-[2.1] tracking-[0.16em] text-neutral-600">
            {!underway ? (
              <>
                You are a guest in room 507, on the fifth floor.
                <span className="mt-2 block">
                  The lift goes down. Every floor it opens on is the same floor,
                  until one of them is not.
                </span>
              </>
            ) : trapped ? (
              `The lift left you on floor ${floorNumber}.`
            ) : (
              `You left off on floor ${floorNumber}.`
            )}
          </p>
        )}

        {/* Always mounted, whatever panel is open: this is the element drei
            looked up, and it only has the one chance to find it. */}
        <button
          id="pointer-lock-target"
          type="button"
          disabled={!interactive || loading}
          className={[
            "font-mono text-[0.8rem] uppercase tracking-[0.4em] transition-colors",
            "text-neutral-300 hover:text-white disabled:opacity-40",
            // Hidden on a sub-panel rather than unmounted, which also means
            // the player is always on the front page when they start: there is
            // no way to begin without coming back here first.
            panel === "main" ? "" : "hidden",
          ].join(" ")}
        >
          {armed ? begin : "Paused"}
        </button>

        {panel === "main" && (
          <div className="flex flex-col items-center gap-4">
            <button type="button" className={LINK} disabled={!interactive}
              onClick={() => setPanel("settings")}>
              Settings
            </button>
            <button type="button" className={LINK} disabled={!interactive}
              onClick={() => setPanel("credits")}>
              Credits
            </button>
            {underway && (
              <button type="button" className={LINK} disabled={!interactive}
                onClick={restart}>
                Begin a different hotel
              </button>
            )}
          </div>
        )}

        {panel === "settings" && (
          <div className="flex flex-col items-center gap-8">
            <div className="flex w-64 flex-col gap-3">
              {[
                { label: "Volume", value: volume, set: setVolume, min: 0, max: 1, step: 0.05,
                  read: `${Math.round(volume * 100)}%` },
                { label: "Look", value: sensitivity, set: setSensitivity, min: 0.3, max: 2.5, step: 0.05,
                  read: `${sensitivity.toFixed(2)}×` },
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

            <dl className="grid grid-cols-[auto_auto] gap-x-5 gap-y-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-neutral-700">
              {CONTROLS.map(([key, label]) => (
                <div key={key} className="contents">
                  <dt className="text-right text-neutral-500">{key}</dt>
                  <dd className="text-left">{label}</dd>
                </div>
              ))}
            </dl>

            <button type="button" className={LINK} onClick={() => setPanel("main")}>
              Back
            </button>
          </div>
        )}

        {panel === "credits" && (
          <div className="flex flex-col items-center gap-8">
            <p className="font-mono text-[0.62rem] leading-[2.4] uppercase tracking-[0.3em] text-neutral-500">
              <span className="block">Written, built and broken by Keshan Gamage</span>
              <span className="mt-3 block text-neutral-700">
                Every hotel in it is a different one
              </span>
              <span className="mt-3 block text-neutral-700">
                Built with Next.js, Three.js and React Three Fiber
              </span>
            </p>
            <button type="button" className={LINK} onClick={() => setPanel("main")}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
