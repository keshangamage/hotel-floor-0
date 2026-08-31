"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether this device can play at all.
 *
 * The game needs pointer lock and a keyboard. On a phone a click does nothing,
 * no message appears, and the visitor leaves looking at a black screen having
 * downloaded ten megabytes for it.
 *
 * Read through useSyncExternalStore rather than an effect: it is the one way
 * to read a browser API during render that is safe on the server, where the
 * answer is assumed to be yes and corrected on hydration.
 */
const QUERY = "(pointer: coarse)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function playable(): boolean {
  if (typeof window === "undefined") return true;
  const touch = window.matchMedia?.(QUERY).matches ?? false;
  const canLock = "requestPointerLock" in document.documentElement;
  return !touch && canLock;
}

export function usePlayable(): boolean {
  // The server has no device to ask, so it assumes yes and the client corrects
  // it. Assuming no would flash this notice at every desktop visitor.
  return useSyncExternalStore(subscribe, playable, () => true);
}

/** Shown instead of the game on anything that cannot run it. */
export function Unsupported() {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black px-8">
      <div className="flex max-w-sm flex-col items-center gap-8 text-center">
        <h1 className="font-mono text-xl font-light uppercase tracking-[0.5em] text-neutral-300">
          Hotel Floor 0
        </h1>
        <p className="font-mono text-[0.7rem] uppercase leading-relaxed tracking-[0.25em] text-neutral-500">
          Needs a keyboard and a mouse
        </p>
        <p className="max-w-xs font-mono text-[0.65rem] leading-loose tracking-[0.15em] text-neutral-700">
          You walk a hotel corridor and decide whether anything has changed
          since the last one. Come back on a computer.
        </p>
      </div>
    </div>
  );
}
