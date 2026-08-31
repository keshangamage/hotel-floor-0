import { DEPTH_TO_WIN, floorAtDepth, isCorrect, judge } from "../game/systems/descent";
import { REFERENCE_FLOOR } from "../game/systems/anomaly";
import { generateFloor, DEFAULT_SEED } from "../game/generation/generateFloor";

let fail = 0;
const check = (n: string, ok: boolean, d = "") => {
  if (!ok) fail++; console.log(`${ok?"PASS":"FAIL"}  ${n}${d?"  "+d:""}`);
};

check("depth 0 is the reference floor", floorAtDepth(0) === REFERENCE_FLOOR);
check("winning depth is floor 0", floorAtDepth(DEPTH_TO_WIN) === 0);

check("going down on a clean floor is right", isCorrect(false, "unchanged"));
check("going up on a wrong floor is right", isCorrect(true, "changed"));
check("going down on a wrong floor is not", !isCorrect(true, "unchanged"));
check("going up on a clean floor is not", !isCorrect(false, "changed"));

// Neither button is ever the safe one, or the game plays itself.
{
  const always = (call: "changed" | "unchanged") =>
    [true, false].filter((anomalous) => isCorrect(anomalous, call)).length;
  check("neither call is always right", always("changed") === 1 && always("unchanged") === 1);
}

check("a right call goes one deeper", judge(2, false, "unchanged").depth === 3);
check("a wrong call costs the whole run", judge(4, false, "changed").depth === 0,
  `landed at depth ${judge(4, false, "changed").depth}`);
check("and puts the player back on the reference floor",
  judge(4, false, "changed").floor === REFERENCE_FLOOR);

// A run of right calls has to actually finish.
{
  let depth = 0;
  let steps = 0;
  while (steps < 50) {
    steps += 1;
    const spec = generateFloor(floorAtDepth(depth), DEFAULT_SEED);
    const call = spec.anomaly ? "changed" : "unchanged";
    const verdict = judge(depth, spec.anomaly !== null, call);
    depth = verdict.depth;
    if (verdict.won) break;
  }
  check("playing correctly reaches floor 0", depth === DEPTH_TO_WIN, `in ${steps} floors`);
  check("and takes one call per floor", steps === DEPTH_TO_WIN, `${steps} calls`);
}

// The run must be winnable on any hotel, not just this one.
{
  let unwinnable = 0;
  for (let i = 0; i < 200; i += 1) {
    const seed = `seed-${i}`;
    let depth = 0;
    for (let step = 0; step < 20 && depth < DEPTH_TO_WIN; step += 1) {
      const spec = generateFloor(floorAtDepth(depth), seed);
      depth = judge(depth, spec.anomaly !== null, spec.anomaly ? "changed" : "unchanged").depth;
    }
    if (depth !== DEPTH_TO_WIN) unwinnable += 1;
  }
  check("every hotel can be finished", unwinnable === 0, `${unwinnable}/200 unwinnable`);
}

// Guessing must not be a strategy. It cannot be made impossible, since any
// run of coin flips comes up eventually, so what matters is the price: a
// guesser should walk far more corridors than someone who looks.
{
  const HONEST = DEPTH_TO_WIN;
  const calls: number[] = [];
  for (let i = 0; i < 2000; i += 1) {
    const random = createSeeded(i);
    let depth = 0;
    let used = 0;
    while (depth < DEPTH_TO_WIN && used < 4000) {
      const spec = generateFloor(floorAtDepth(depth), `guess-${i}`);
      const call = random() < 0.5 ? "changed" : "unchanged";
      depth = judge(depth, spec.anomaly !== null, call).depth;
      used += 1;
    }
    calls.push(used);
  }
  calls.sort((a, b) => a - b);
  const median = calls[Math.floor(calls.length / 2)]!;
  check("looking is far cheaper than guessing",
    median > HONEST * 5,
    `${median} floors walked guessing against ${HONEST} looking`);
  // And a guesser must never stumble straight through.
  const lucky = calls.filter((c) => c === HONEST).length / calls.length;
  check("almost nobody guesses a clean run", lucky < 0.06,
    `${(lucky * 100).toFixed(1)}% got it first try`);
}

// Reaching the bottom has to stick. judge itself still answers at full depth,
// so the elevator refuses the call instead; this pins down what judge does so
// the two cannot drift apart.
{
  const atEnd = judge(DEPTH_TO_WIN, false, "unchanged");
  check("a right call at the bottom stays at the bottom",
    atEnd.depth === DEPTH_TO_WIN && atEnd.won, `depth ${atEnd.depth}`);
  const wrong = judge(DEPTH_TO_WIN, true, "unchanged");
  check("judge alone would take a finished run away", wrong.depth === 0,
    "which is why the elevator stops asking");
}

function createSeeded(n: number) {
  let state = n * 2654435761 + 1;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
