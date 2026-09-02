"use client";

import { useEffect, useState } from "react";

import { perf } from "@/game/systems/perf";
import { useGameStore } from "@/store/useGameStore";

/** Slow enough to read. The probe averages faster than this anyway. */
const REFRESH_MS = 400;

/**
 * Frame timing, on screen.
 *
 * Every other budget in this project is checked by a test that runs offline.
 * This one cannot be: it depends on the machine, and the machine is not here.
 * So it is put where the person with the machine can read it.
 */
export function Stats() {
  const showStats = useGameStore((state) => state.showStats);
  const [shown, setShown] = useState({ fps: 0, worst: 0, calls: 0, triangles: 0 });

  useEffect(() => {
    if (!showStats) return;
    const timer = setInterval(() => setShown({ ...perf }), REFRESH_MS);
    return () => clearInterval(timer);
  }, [showStats]);

  if (!showStats) return null;

  // 16.7ms is a frame at 60. Anything much over it is one the player felt.
  const smooth = shown.worst > 0 && shown.worst < 22;

  return (
    <dl className="pointer-events-none absolute right-6 top-6 z-30 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 font-mono text-[0.6rem] tabular-nums tracking-[0.12em] text-neutral-500">
      {([
        ["fps", shown.fps.toFixed(0)],
        ["worst frame", `${shown.worst.toFixed(1)}ms`],
        ["draw calls", String(shown.calls)],
        ["triangles", shown.triangles.toLocaleString("en-GB")],
      ] as const).map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-right text-neutral-600 uppercase">{label}</dt>
          <dd className={label === "worst frame" && !smooth ? "text-neutral-300" : ""}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
