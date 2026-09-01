import { createAmbience, depthOf, stepAmbience, whispers } from "../game/systems/ambience";
import { createRandom } from "../game/systems/random";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const FRAME = 1 / 60;

/** Runs a floor for a while and reports when each sound landed. */
function listen(floor: number, seconds: number, seed = "night-porter") {
  const random = createRandom(`${seed}:ambience:${floor}`);
  const state = createAmbience(floor, random);
  const creaks: number[] = [];
  const voices: number[] = [];
  for (let t = 0; t < seconds; t += FRAME) {
    const heard = stepAmbience(state, FRAME, floor, random);
    if (heard.creak) creaks.push(t);
    if (heard.whisper) voices.push(t);
  }
  return { creaks, voices };
}

const gaps = (times: readonly number[]) =>
  times.slice(1).map((t, i) => t - (times[i] as number));

// Stepping out of the lift has to be quiet. A noise on the first frame is
// heard as the doors, and tells the player nothing about the floor.
{
  for (const floor of [5, 0, -3]) {
    const random = createRandom("x");
    const state = createAmbience(floor, random);
    const first = stepAmbience(state, FRAME, floor, random);
    check(`floor ${floor} is quiet on arrival`, !first.creak && !first.whisper);
  }
}

// It has to be occasional in both directions: twice in five seconds is a
// machine, and a silent minute is a floor with nothing on it.
{
  const TEN_MINUTES = 600;
  for (const floor of [5, 1, -1, -3]) {
    const { creaks } = listen(floor, TEN_MINUTES);
    const spacing = gaps(creaks);
    const tightest = Math.min(...spacing);
    const longest = Math.max(...spacing);
    check(`floor ${floor} settles more than once`, creaks.length >= 8,
      `${creaks.length} in ten minutes`);
    check(`floor ${floor} never twice at once`, tightest >= 8,
      `closest ${tightest.toFixed(1)}s`);
    check(`floor ${floor} is never silent for a minute`, longest <= 45,
      `longest ${longest.toFixed(1)}s`);
  }
}

// The descent is busier, not louder. That is the difference between a place
// that is frightening and a place that is noisy.
{
  const top = listen(5, 900).creaks.length;
  const bottom = listen(-3, 900).creaks.length;
  check("the bottom settles more often than the top", bottom > top,
    `${top} up there, ${bottom} down here`);

  check("depth is nothing above ground", depthOf(5) === 0 && depthOf(0) === 0);
  check("and everything at the bottom", depthOf(-3) === 1);
  check("and rises on the way down", depthOf(-1) < depthOf(-2) && depthOf(-2) < depthOf(-3));
  check("and never passes one", depthOf(-40) === 1, "so a deeper floor cannot invert it");
}

// A voice belongs to the descent. The hotel's own floors are empty.
{
  for (const floor of [5, 4, 3, 2, 1, 0]) {
    check(`nothing whispers on floor ${floor}`,
      !whispers(floor) && listen(floor, 900).voices.length === 0);
  }
  for (const floor of [-1, -2, -3]) {
    const { voices } = listen(floor, 900);
    check(`something whispers on floor ${floor}`, whispers(floor) && voices.length > 0,
      `${voices.length} in fifteen minutes`);
    const spacing = gaps(voices);
    check(`and not on top of itself on floor ${floor}`, Math.min(...spacing) >= 10,
      `closest ${Math.min(...spacing).toFixed(1)}s`);
  }
}

// The same floor of the same hotel has to settle the same way, or a player who
// rides back up to check finds a different building.
{
  const a = listen(-2, 300);
  const b = listen(-2, 300);
  check("a floor sounds the same every time it is visited",
    JSON.stringify(a) === JSON.stringify(b));
  const other = listen(-2, 300, "another-hotel");
  check("and two hotels do not", JSON.stringify(a) !== JSON.stringify(other));
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
