import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";

import { createPerf, perf, samplePerf } from "@/game/systems/perf";

/**
 * Measures the frame rate from inside the canvas.
 *
 * Mounted last, so it times a whole frame's worth of work rather than
 * whatever has run before it. Writes to a module object instead of the store:
 * a number that changes sixty times a second is not worth a re-render, and the
 * overlay that draws it reads on its own clock.
 */
export function PerfProbe() {
  const gl = useThree((state) => state.gl);
  const state = useRef(createPerf());

  useFrame((_, delta) => {
    // Timed whether the game is paused or not. A menu that runs at nine frames
    // a second is still a problem, and it is often where one shows up.
    if (!samplePerf(state.current, delta)) return;

    perf.fps = state.current.fps;
    perf.worst = state.current.worst;
    perf.calls = gl.info.render.calls;
    perf.triangles = gl.info.render.triangles;
  });

  return null;
}
