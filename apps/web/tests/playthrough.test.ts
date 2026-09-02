// zustand turns persist off entirely when there is no localStorage, so the
// stub has to be in place before the store module is imported.
const store_: Record<string, string> = {};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store_[k] ?? null,
  setItem: (k: string, v: string) => { store_[k] = v; },
  removeItem: (k: string) => { delete store_[k]; },
};

const { useGameStore } = await import("../store/useGameStore");
const { generateFloor } = await import("../game/generation/generateFloor");
const { buildFloor, GUEST_KEY, LEDGER } = await import("../game/data/floor");
const {
  ELEVATOR_CONFIG, G_FLOOR, createElevator, isServed, requestFloor, stepElevator,
} = await import("../game/systems/elevator");
const { COUNT_DOWN, countPress, counted } = await import("../game/systems/count");
const { ENDING_FLOOR, REFERENCE_FLOOR } = await import("../game/systems/anomaly");

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const state = () => useGameStore.getState();

/**
 * Rides the car, stepping the real machine rather than assuming it arrives.
 * Returns the floor it opened on.
 */
function ride(car: ReturnType<typeof createElevator>, to: number): number {
  if (!requestFloor(car, to, ELEVATOR_CONFIG)) return car.floor;
  for (let t = 0; t < 60 * 60 && car.floor !== to; t += 1) {
    stepElevator(car, 1 / 60, ELEVATOR_CONFIG);
  }
  return car.floor;
}

/** The page at the end of a corridor, which is what opens the next floor. */
const page = (floor: number) =>
  buildFloor(generateFloor(floor)).notes.find((n) => n.id.startsWith("floor-"));

// One run, from the fifth floor to the end, doing only what a player can do.
// Every other suite checks a part of this. Nothing checked that the parts join
// up, and a game that cannot be finished is the one bug worth catching first.
{
  const car = createElevator(REFERENCE_FLOOR);
  const walked: number[] = [];

  // The fifth floor: the key and the notebook are both on the desk of 507.
  const start = buildFloor(generateFloor(REFERENCE_FLOOR));
  check("the run starts in 507", generateFloor(REFERENCE_FLOOR).spawnRoom === 507);
  check("with a key and a notebook to pick up",
    start.items.some((i) => i.id === GUEST_KEY) && start.items.some((i) => i.id === LEDGER),
    start.items.map((i) => i.id).join(", "));
  useGameStore.setState({ carrying: { [GUEST_KEY]: true, [LEDGER]: true } });

  // Down through the hotel. Every floor is reachable before the trap.
  for (const floor of [4, 3, 2, 1, ENDING_FLOOR]) {
    check(`the lift will take the player to ${floor}`, isServed(floor, ELEVATOR_CONFIG));
    check(`and it arrives`, ride(car, floor) === floor, `at ${car.floor}`);
    walked.push(floor);
  }

  // Floor zero springs the trap.
  useGameStore.setState({ trapped: true, floorNumber: ENDING_FLOOR });
  check("arriving at zero traps the player", state().trapped);

  // From here every floor is opened by the page on the one above it.
  let floor: number = ENDING_FLOOR;
  for (let step = 0; step < 8; step += 1) {
    // G is the end, not another floor to be let off. It has nothing to read.
    if (floor === G_FLOOR) break;

    const found = page(floor);
    check(`floor ${floor} has a page to read`, found !== undefined);
    if (!found?.opens) break;

    state().offer(found.opens);
    check(`and reading it puts ${found.opens} on the panel`, state().offered === found.opens);
    check(`which the lift will go to`, isServed(found.opens, ELEVATOR_CONFIG));
    check(`and does`, ride(car, found.opens) === found.opens, `at ${car.floor}`);

    floor = found.opens;
    walked.push(floor);
  }

  check("the descent reaches G", floor === G_FLOOR, `stopped at ${floor}`);
  check("and walks every floor between", walked.length === 9,
    walked.join(", "));
}

// The last floor asks for the count before it gives up G. A run that could not
// enter it would stop one press from the end.
{
  const last = page(-3);
  check("the last page offers G", last?.opens === G_FLOOR);

  let progress = 0;
  for (const number of COUNT_DOWN) progress = countPress(progress, number);
  check("and counting down on the dead panel completes it", counted(progress),
    COUNT_DOWN.join(" "));

  // The count is the only way. A player mashing the panel does not fall into it.
  let mashed = 0;
  for (const number of [5, 5, 4, 4, 3, 3, 2, 2, 1, 1]) mashed = countPress(mashed, number);
  check("but pressing everything twice does not", !counted(mashed));
}

// And the ending is a phase the game can actually reach.
{
  useGameStore.setState({ floorNumber: G_FLOOR });
  state().finish();
  check("arriving at G ends the run", state().phase === "ending");

  // The tally the player is shown at the end counts what they walked.
  useGameStore.setState({
    visited: { "4": true, "3": true, "2": true, "1": true },
    marked: { "3": true },
  });
  const { tally } = await import("../game/systems/ledger");
  const count = tally(state().seed, state().visited, state().marked);
  check("and the notebook has something to say about it",
    count.walked === 4 && count.written === 1,
    `walked ${count.walked}, written ${count.written}, wrong ${count.wrong}`);

  // Starting again leaves nothing of the run behind.
  state().restart();
  check("and a new hotel starts clean",
    state().phase === "menu" && !state().trapped
      && Object.keys(state().carrying).length === 0,
    "a door already open in a building nobody has entered");
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
