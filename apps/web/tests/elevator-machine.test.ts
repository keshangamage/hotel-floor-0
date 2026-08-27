import {
  ELEVATOR_CONFIG, callElevator, closeDoors, createElevator, displayFloor,
  isServed, requestFloor, stepElevator, type ElevatorConfig, type ElevatorState,
} from "../game/systems/elevator";
import { FLOOR_5_LAYOUT } from "../game/data/floor";

let fail = 0;
const check = (n: string, ok: boolean, d = "") => { if (!ok) fail++; console.log(`${ok?"PASS":"FAIL"}  ${n}${d?"  "+d:""}`); };

const CFG: ElevatorConfig = { ...ELEVATOR_CONFIG, servedFloors: [0, 1, 5] };
const run = (s: ElevatorState, seconds: number, cfg = CFG) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepElevator(s, 1 / 60, cfg);
};

// Doors start shut.
let e = createElevator(5);
check("starts closed with doors shut", e.phase === "closed" && e.doors === 0);

// Call -> opens -> holds -> closes itself.
callElevator(e, CFG);
check("calling starts the doors opening", e.phase === "opening");
run(e, CFG.openTime + 0.1);
check("doors reach fully open", e.phase === "open" && e.doors === 1, `doors=${e.doors.toFixed(2)}`);
run(e, CFG.holdTime + 0.1);
check("doors begin closing after the hold", e.phase === "closing");
run(e, CFG.openTime + 0.1);
check("doors end shut", e.phase === "closed" && e.doors === 0);

// Calling again while open extends the hold rather than restarting.
e = createElevator(5);
callElevator(e, CFG); run(e, CFG.openTime + 0.1);
run(e, CFG.holdTime - 0.5);
callElevator(e, CFG);
check("calling while open re-holds the doors", e.phase === "open" && e.hold > CFG.holdTime - 0.1,
  `hold=${e.hold.toFixed(2)}`);

// Close button.
closeDoors(e);
check("close button starts closing", e.phase === "closing");

// Travel: shut the doors, move, arrive, reopen.
e = createElevator(5);
check("requesting an unserved floor is refused", requestFloor(e, 3, CFG) === false);
check("refusal leaves the car alone", e.phase === "closed" && e.target === null);
check("requesting a served floor is accepted", requestFloor(e, 0, CFG) === true);
check("travels immediately when already shut", e.phase === "travelling", e.phase);
check("doors stay shut while travelling", e.doors === 0);
run(e, 5 * CFG.travelPerFloor + 0.2);
check("arrives at the requested floor", e.floor === 0, `floor=${e.floor}`);
check("opens on arrival", e.phase === "opening" || e.phase === "open");

// The readout counts through floors on the way.
e = createElevator(5);
requestFloor(e, 0, CFG);
const seen = new Set<number>();
for (let t = 0; t < 5 * CFG.travelPerFloor; t += 1 / 60) {
  stepElevator(e, 1 / 60, CFG);
  seen.add(displayFloor(e));
}
check("display counts through intermediate floors", seen.size >= 4, `saw ${[...seen].sort((a,b)=>b-a).join(",")}`);
check("display never shows a floor outside the journey",
  [...seen].every(f => f >= 0 && f <= 5));

// Selecting a floor while the doors are open closes them first.
e = createElevator(5);
callElevator(e, CFG); run(e, CFG.openTime + 0.1);
requestFloor(e, 0, CFG);
check("selecting a floor while open closes the doors first", e.phase === "closing");
run(e, CFG.openTime + 0.05);
check("then departs", e.phase === "travelling");

// Pressing the current floor just opens the doors.
e = createElevator(5);
requestFloor(e, 5, CFG);
check("pressing the current floor opens rather than travels", e.phase === "opening" && e.target === null);

// Doors are never partly open while travelling, which would expose the shaft.
e = createElevator(5);
requestFloor(e, 0, CFG);
let leaked = false;
for (let t = 0; t < 5 * CFG.travelPerFloor; t += 1 / 60) {
  stepElevator(e, 1 / 60, CFG);
  if (e.phase === "travelling" && e.doors > 0.001) leaked = true;
}
check("doors are never open while the car moves", !leaked);

// The descent goes one floor at a time from 5 down to 0, so every step of it
// has to be reachable. A gap would strand the player mid run.
check("every floor of the descent is served",
  [5, 4, 3, 2, 1, 0].every((f) => isServed(f, ELEVATOR_CONFIG)),
  ELEVATOR_CONFIG.servedFloors.join(", "));
check("and nothing below floor 0 is",
  [-1, -2].every((f) => !isServed(f, ELEVATOR_CONFIG)));

// Sound follows this machine's transitions, so one trip has to mean one
// arrival. A phase that flickers would ring the bell over and over.
{
  const car = createElevator(5);
  const seen: string[] = [];
  let previous = car.phase;
  requestFloor(car, 0, CFG);
  for (let t = 0; t < 5 * CFG.travelPerFloor + 20; t += 1 / 60) {
    stepElevator(car, 1 / 60, CFG);
    if (car.phase !== previous) { seen.push(`${previous}->${car.phase}`); previous = car.phase; }
  }
  const arrivals = seen.filter((t) => t.startsWith("travelling->")).length;
  const departures = seen.filter((t) => t.endsWith("->travelling")).length;
  check("one trip departs once", departures === 1, `${departures}`);
  check("and arrives once, so the bell rings once", arrivals === 1, `${arrivals}`);
  check("the car ends up where it was sent", car.floor === 0, `floor ${car.floor}`);
  // Doors opening and closing each drive a sound, so they must not chatter.
  const opens = seen.filter((t) => t.endsWith("->opening")).length;
  check("the doors do not chatter", opens <= 2, `${opens} openings: ${seen.join(", ")}`);
}

// Light switches
check("room 507 has a light switch", FLOOR_5_LAYOUT.switches.length === 1);
const sw = FLOOR_5_LAYOUT.switches[0]!;
check("the switch targets a real lamp",
  FLOOR_5_LAYOUT.lamps.some(l => l.id === sw.targetLampId), sw.targetLampId);
check("the switch is at reachable height", sw.position[1] > 0.9 && sw.position[1] < 1.5,
  `y=${sw.position[1].toFixed(2)}`);

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
