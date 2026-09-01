import {
  createWatch, isWatched, LOOK_AWAY_TIME, stepWatch, type Watcher,
} from "../game/systems/observation";
import type { Point3 } from "../game/types";

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const at = (x: number, y: number, z: number): Point3 => ({ x, y, z });
/** Facing down -Z, which is how the player looks up a corridor. */
const looking = (dx: number, dz: number): Watcher => {
  const len = Math.hypot(dx, dz);
  return { at: at(0, 1.6, 0), facing: at(dx / len, 0, dz / len) };
};
const ahead = looking(0, -1);
const FRAME = 1 / 60;

// Straight ahead, close: watched.
check("something in front is watched", isWatched(ahead, at(0, 1.6, -3), false));
check("and stays watched", isWatched(ahead, at(0, 1.6, -3), true));

// Behind: not, however long it has been there.
check("something behind is not", !isWatched(ahead, at(0, 1.6, 4), false));
check("even if it was a moment ago", !isWatched(ahead, at(0, 1.6, 4), true));

// Off to the side, past the cone.
check("something square to the side is not watched",
  !isWatched(ahead, at(6, 1.6, 0), false));

// Too far to be watched closely, even dead ahead.
check("something far up the corridor is not watched",
  !isWatched(ahead, at(0, 1.6, -30), false));

// The edge has width, or a target on the boundary flickers as the player
// breathes and a creeping chair slides across the floor.
{
  // 1.05 rad off axis: past the angle that notices it, inside the one that keeps it.
  const edge = at(5.2, 1.6, -3);
  const noticing = isWatched(ahead, edge, false);
  const keeping = isWatched(ahead, edge, true);
  check("the edge of vision has width", keeping && !noticing,
    "already watched counts further round than newly noticed");
}

// A glance away must not be enough.
{
  const watch = createWatch();
  const target = at(0, 1.6, -3);
  for (let t = 0; t < 1; t += FRAME) stepWatch(watch, ahead, target, FRAME);
  check("watching for a while does not fire", watch.watched && watch.held > 0.9);

  const away = looking(0, 1);
  let fired = false;
  for (let t = 0; t < LOOK_AWAY_TIME / 2; t += FRAME) {
    if (stepWatch(watch, away, target, FRAME)) fired = true;
  }
  check("a glance away is not long enough", !fired, `under ${LOOK_AWAY_TIME}s`);

  // Look back, then away properly.
  for (let t = 0; t < 0.3; t += FRAME) stepWatch(watch, ahead, target, FRAME);
  let count = 0;
  for (let t = 0; t < 3; t += FRAME) {
    if (stepWatch(watch, away, target, FRAME)) count += 1;
  }
  check("looking away long enough fires", count > 0);
  check("and fires once, not every frame after", count === 1,
    `${count} times over three seconds`);
}

// Standing with your back turned must not keep firing.
{
  const watch = createWatch();
  const target = at(0, 1.6, 4);
  let count = 0;
  for (let t = 0; t < 10; t += FRAME) {
    if (stepWatch(watch, ahead, target, FRAME)) count += 1;
  }
  check("a thing never looked at fires once at most", count <= 1, `${count} in ten seconds`);
}

// Turning back and away again is a second chance for it to move.
{
  const watch = createWatch();
  const target = at(0, 1.6, -3);
  const away = looking(0, 1);
  let count = 0;
  const turn = (to: Watcher, seconds: number) => {
    for (let t = 0; t < seconds; t += FRAME) if (stepWatch(watch, to, target, FRAME)) count += 1;
  };
  for (let i = 0; i < 4; i += 1) { turn(ahead, 0.9); turn(away, 1.2); }
  check("each turn of the head is its own chance", count === 4, `${count} over four turns`);
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
