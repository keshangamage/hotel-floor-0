import { WINDOW, createPerf, samplePerf } from "../game/systems/perf";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

/** Runs a steady frame rate for a while and returns the last published sample. */
function run(fps: number, seconds: number) {
  const state = createPerf();
  const frame = 1 / fps;
  for (let t = 0; t < seconds; t += frame) samplePerf(state, frame);
  return state;
}

// Nothing is published until a window closes, or the first reading is one
// frame's worth of guesswork.
{
  const state = createPerf();
  const ready = samplePerf(state, 1 / 60);
  check("one frame publishes nothing", !ready && state.fps === 0);
  check("and a window is worth waiting for", WINDOW >= 0.25 && WINDOW <= 1,
    `${WINDOW}s`);
}

// The average has to be the average.
{
  for (const rate of [30, 60, 120, 144]) {
    const state = run(rate, 3);
    check(`a steady ${rate} reads as ${rate}`, Math.abs(state.fps - rate) < 1.5,
      state.fps.toFixed(1));
  }
}

// And the worst frame has to survive being averaged with good ones, because an
// average of sixty hides a run that hitches once a second and the hitch is
// what the player actually feels.
{
  const state = createPerf();
  // A half second of clean frames with one long one buried in the middle.
  for (let i = 0; i < 15; i += 1) samplePerf(state, 1 / 60);
  samplePerf(state, 0.12);
  let published = false;
  for (let i = 0; i < 60 && !published; i += 1) published = samplePerf(state, 1 / 60);

  check("a single long frame is published", published && state.worst > 100,
    `${state.worst.toFixed(0)}ms`);
  check("even though the average looks fine", state.fps > 45,
    `${state.fps.toFixed(0)} fps with a ${state.worst.toFixed(0)}ms stall in it`);
}

// Each window stands on its own, or one bad second poisons the readout for
// the rest of the run.
{
  // From a fresh state, so the stall lands in a window of its own rather than
  // wherever the previous frames happened to leave the clock.
  const state = createPerf();
  samplePerf(state, 0.2);
  while (!samplePerf(state, 1 / 60)) { /* close the window the stall is in */ }
  // Read before driving another window, or this is the next window's number.
  const stalled = state.worst;
  while (!samplePerf(state, 1 / 60)) { /* and the one after it */ }

  check("a stall does not follow the next window", stalled > 100 && state.worst < 25,
    `${stalled.toFixed(0)}ms then ${state.worst.toFixed(1)}ms`);
}

// The readout has to be reachable, and on the list like every other key.
{
  const { readFileSync } = await import("node:fs");
  check("a key shows it",
    /Backquote: "stats"/.test(readFileSync("apps/web/game/systems/input.ts", "utf8")));
  check("and it is on the controls screen",
    /"`", "Frame rate"/.test(readFileSync("apps/web/components/ui/Overlay.tsx", "utf8")),
    "a diagnostic nobody can find is not one");
  // Timed through the pause too: a menu that runs at nine frames a second is
  // still a problem, and it is often where one shows up.
  check("and it keeps measuring while the game is paused",
    !/phase !== "playing"/.test(readFileSync("apps/web/components/game/PerfProbe.tsx", "utf8")));
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
