import { createStepTracker, stepDue, stepWeight, type Gait } from "../game/systems/footsteps";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

/** Walk a distance in small increments, as the frame loop would. */
function walk(metres: number, gait: Gait, step = 0.02) {
  const tracker = createStepTracker();
  const feet: boolean[] = [];
  let travelled = 0;
  while (travelled < metres) {
    travelled += step;
    if (stepDue(tracker, travelled, gait)) feet.push(tracker.left);
  }
  return feet;
}

const walked = walk(20, "walk");
check("walking fires steps", walked.length > 0, `${walked.length} over 20m`);
check("walking cadence is about one step per 0.78m",
  Math.abs(20 / walked.length - 0.78) < 0.06, `${(20 / walked.length).toFixed(2)}m per step`);

const sprinted = walk(20, "sprint");
const crouched = walk(20, "crouch");
check("a sprint covers more ground per stride than a walk",
  sprinted.length < walked.length, `sprint ${sprinted.length} vs walk ${walked.length}`);
check("crouching takes shorter steps than walking",
  crouched.length > walked.length, `crouch ${crouched.length} vs walk ${walked.length}`);

check("feet alternate", walked.every((left, i) => i === 0 || left !== walked[i - 1]),
  walked.slice(0, 6).map((l) => (l ? "L" : "R")).join(" "));

// Standing still must be silent, or the player hears themselves walk on the spot.
{
  const tracker = createStepTracker();
  let steps = 0;
  for (let i = 0; i < 600; i += 1) if (stepDue(tracker, 5.0, "walk")) steps += 1;
  check("standing still fires at most the one step that got there", steps <= 1, `${steps} steps`);
}

// A floor change moves the player without them walking there.
{
  const tracker = createStepTracker();
  let travelled = 0;
  for (let i = 0; i < 200; i += 1) { travelled += 0.02; stepDue(tracker, travelled, "walk"); }
  let burst = 0;
  travelled += 400;
  for (let i = 0; i < 60; i += 1) if (stepDue(tracker, travelled, "walk")) burst += 1;
  check("a long jump forward does not fire a burst of steps", burst <= 1, `${burst} steps`);
}

// Respawning resets the distance total to zero.
{
  const tracker = createStepTracker();
  let travelled = 0;
  for (let i = 0; i < 500; i += 1) { travelled += 0.02; stepDue(tracker, travelled, "walk"); }
  let burst = 0;
  for (let i = 0; i < 60; i += 1) if (stepDue(tracker, 0, "walk")) burst += 1;
  check("the total resetting to zero does not fire a burst", burst === 0, `${burst} steps`);
}

check("a crouched step is quieter than a sprint",
  stepWeight("crouch") < stepWeight("walk") && stepWeight("walk") < stepWeight("sprint"),
  `${stepWeight("crouch")} < ${stepWeight("walk")} < ${stepWeight("sprint")}`);

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
