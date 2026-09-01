"use client";

import { useEffect, useState } from "react";

import { tally } from "@/game/systems/ledger";
import { useGameStore } from "@/store/useGameStore";

/** Long enough to watch the corridor go, short enough not to be a loading screen. */
const SWALLOW_MS = 2600;
const READ_MS = 9000;

const CLOSING = [
  "G.",
  "The word that is not a number.",
  "",
  "The doors open on the fifth floor, and the carpet",
  "is the carpet from the landing at home.",
  "",
  "You have been listening for it ever since.",
];

/**
 * The end of a run.
 *
 * Nothing here freezes the game: reaching this phase already stops every frame
 * loop, so the corridor behind this is a still of the last thing the player was
 * shown. The black is drawn over it slowly rather than cut to, so they watch it
 * go instead of being told it is gone.
 */
export function Ending() {
  const phase = useGameStore((state) => state.phase);
  // Mounted only while it is showing, so its timeline resets by construction
  // rather than by clearing state on the way out.
  return phase === "ending" ? <EndingScreen /> : null;
}

function EndingScreen() {
  const restart = useGameStore((state) => state.restart);
  const seed = useGameStore((state) => state.seed);
  const visited = useGameStore((state) => state.visited);
  const marked = useGameStore((state) => state.marked);
  const carried = useGameStore((state) => state.carrying);
  const [stage, setStage] = useState(0);

  // Only worth saying to a player who was keeping one. Somebody who never
  // found the notebook was not quietly running a tally in their head, and
  // telling them what they missed would be scoring a game they were not
  // playing.
  const kept = carried.ledger === true;
  const count = tally(seed, visited, marked);

  useEffect(() => {
    // Pointer lock outlives the frame loop, so it is released by hand.
    document.exitPointerLock();
    const timers = [
      setTimeout(() => setStage(1), SWALLOW_MS),
      setTimeout(() => setStage(2), READ_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black transition-opacity duration-[2400ms] ease-in"
      style={{ opacity: stage === 0 ? 0 : 1 }}
    >
      <div className="flex flex-col items-center gap-12 px-6 text-center">
        <p
          className="font-mono text-[0.78rem] leading-[2.4] tracking-[0.22em] text-neutral-400 transition-opacity duration-[1800ms]"
          style={{ opacity: stage >= 1 ? 1 : 0 }}
        >
          {CLOSING.map((line, index) => (
            <span key={index} className="block min-h-[1.2em]">
              {line}
            </span>
          ))}
        </p>

        <div
          className="flex flex-col items-center gap-6 transition-opacity duration-[1800ms]"
          style={{ opacity: stage >= 2 ? 1 : 0 }}
        >
          {kept && count.walked > 0 && (
            <p className="font-mono text-[0.68rem] leading-[2.2] tracking-[0.2em] text-neutral-500">
              <span className="block">
                {`You walked ${count.walked} ${count.walked === 1 ? "floor" : "floors"}.`}
                {` ${count.wrong} of them were not as they should have been.`}
              </span>
              <span className="block">
                {count.written === 0
                  ? "You wrote nothing down."
                  : `You wrote down ${count.written}, and were right about ${count.caught}.`}
              </span>
              {count.missed > 0 && (
                <span className="block text-neutral-600">
                  {`${count.missed} you walked straight through.`}
                </span>
              )}
            </p>
          )}
          <h2 className="font-mono text-lg font-light uppercase tracking-[0.55em] text-neutral-500">
            Hotel Floor 0
          </h2>
          <p className="font-mono text-[0.55rem] uppercase leading-[2.4] tracking-[0.3em] text-neutral-700">
            <span className="block">Written, built and broken by Keshan Gamage</span>
            <span className="block">Every hotel in it is a different one</span>
          </p>

          <button
            type="button"
            onClick={restart}
            disabled={stage < 2}
            className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-neutral-600 underline-offset-8 transition-colors hover:text-neutral-300 hover:underline"
          >
            Stay another night
          </button>
        </div>
      </div>
    </div>
  );
}
