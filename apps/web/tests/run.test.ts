// zustand turns persist off entirely when there is no localStorage, so the
// stub has to exist before the store module is evaluated.
const saved = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => saved.get(k) ?? null,
  setItem: (k: string, v: string) => void saved.set(k, v),
  removeItem: (k: string) => void saved.delete(k),
};

const { useGameStore } = await import("../store/useGameStore");

let fail = 0;
const check = (n: string, ok: boolean, d = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`);
};

const store = () => useGameStore.getState();
const reset = () => useGameStore.setState({ trapped: false, offered: null, floorNumber: 5 });

// The premise. The lift works like any hotel's until the player reaches floor
// zero, and never again afterwards.
{
  reset();
  check("the lift answers to begin with", store().trapped === false);
  store().setTrapped();
  check("reaching floor zero stops it", store().trapped === true);
  store().setTrapped();
  check("and it stays stopped", store().trapped === true, "never undone");
}

// The trap is the run. A player who reloads is still stuck.
{
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("apps/web/store/useGameStore.ts", "utf8");
  const block = source.slice(source.indexOf("partialize:"));
  for (const key of ["seed", "floorNumber", "trapped", "offered"]) {
    check(`${key} survives a reload`, new RegExp(`${key}: state\\.${key}`).test(block));
  }
  // Restoring these would drop the player into a paused menu holding a note.
  const moment = ["phase", "reading", "interactPrompt"];
  const leaked = moment.filter((k) => new RegExp(`${k}: state\\.${k}`).test(block));
  check("nothing about the moment is saved", leaked.length === 0, leaked.join(", ") || "none");
  check("hydration is deferred to the client", /skipHydration:\s*true/.test(source));
  check("and something actually rehydrates",
    /persist\.rehydrate\(\)/.test(readFileSync("apps/web/components/game/GameShell.tsx", "utf8")));
}

// The lift itself: a normal panel that goes dead.
{
  const { readFileSync } = await import("node:fs");
  const lift = readFileSync("apps/web/components/environment/Elevator.tsx", "utf8");
  const { panelButtons } = await import("../game/data/panel");
  const { ELEVATOR_CONFIG } = await import("../game/systems/elevator");
  const numbered = panelButtons(ELEVATOR_CONFIG.servedFloors, false, null)
    .filter((row) => row.kind === "floor")
    .map((row) => row.floor);
  check("the panel offers the floors the hotel has",
    [5, 4, 3, 2, 1, 0].every((floor) => numbered.includes(floor)),
    "so pressing 0 is an accident among ordinary buttons");
  // The floors under the building are not on the panel to begin with.
  check("but not the ones beneath it", numbered.every((floor) => (floor ?? 0) >= 0),
    numbered.join(", "));
  check("a trapped lift refuses every one of them",
    /if \(trapped && floor !== offered\)/.test(lift));
  // Silence would read as the game missing the input rather than refusing it.
  check("but still answers the press with a sound",
    /floor !== offered\)[\s\S]{0,220}audio\.click/.test(lift));
  // Sprung on arrival, so the doors open before the player learns they cannot
  // leave.
  check("the trap springs when the doors open, not when the button is pressed",
    /state\.floor === ENDING_FLOOR\) useGameStore\.getState\(\)\.setTrapped/.test(lift));
}

// Settings outlive everything, since resetting someone's volume is its own
// small insult.
{
  reset();
  store().setVolume(0.25);
  store().setSensitivity(1.8);
  store().setTrapped();
  check("settings survive being trapped",
    store().volume === 0.25 && store().sensitivity === 1.8);

  const { readFileSync } = await import("node:fs");
  const read = (f: string) => readFileSync(`apps/web/${f}`, "utf8");
  check("volume reaches the mixer", /audio\.setVolume\(volume\)/.test(read("components/game/Audio.tsx")));
  check("the mixer ramps rather than jumps", /setTargetAtTime/.test(read("game/systems/audio.ts")),
    "a gain that jumps clicks on every pixel of a drag");
  check("sensitivity reaches the look controls",
    /pointerSpeed=\{POINTER_SPEED \* sensitivity\}/.test(read("components/player/LookControls.tsx")));
  check("a click on a slider does not lock the pointer",
    /stopPropagation/.test(read("components/ui/Overlay.tsx")));
}

// Pausing has to freeze the world, not half of it.
{
  const { readFileSync } = await import("node:fs");
  const read = (f: string) => readFileSync(`apps/web/components/${f}`, "utf8");
  const gated = (src: string) => /phase !== "playing"\) return|phase === "playing"/.test(src);

  for (const [what, file] of [
    ["the lift", "environment/Elevator.tsx"],
    ["the hotel's sound", "game/Audio.tsx"],
    ["a swinging door", "environment/HingedDoor.tsx"],
    ["the player", "player/Player.tsx"],
    ["interaction", "game/Interactions.tsx"],
    ["things that move unwatched", "horror/LookAway.tsx"],
  ] as const) {
    check(`${what} stops when the game is paused`, gated(read(file)));
  }

  // A flickering fixture is purely visual, behind an opaque overlay, and
  // costs the player nothing to leave running.
  check("a flickering lamp is left alone", !gated(read("lighting/CeilingLamp.tsx")),
    "purely visual, behind an opaque overlay");
  // The torch used to be in that list. It burns a cell now, so a paused game
  // that kept draining it would take something from a player who is not there.
  check("but the torch stops, because it is spending something",
    gated(read("player/Flashlight.tsx")));
}

// A device that cannot play must be told so, not left looking at a black
// screen having downloaded ten megabytes of hotel for nothing.
{
  const { readFileSync, existsSync } = await import("node:fs");
  const gate = readFileSync("apps/web/components/game/Unsupported.tsx", "utf8");
  const shell = readFileSync("apps/web/components/game/GameShell.tsx", "utf8");

  check("touch devices are detected", /pointer: coarse/.test(gate));
  check("and so is a browser without pointer lock", /requestPointerLock" in document/.test(gate));
  check("read without an effect", /useSyncExternalStore/.test(gate));
  check("and assumed playable on the server", /\(\) => true/.test(gate));
  check("the game does not mount on an unplayable device",
    /if \(!playable\)/.test(shell) && shell.indexOf("if (!playable)") < shell.indexOf("<GameCanvas"),
    "returns before the canvas");

  const layout = readFileSync("apps/web/app/layout.tsx", "utf8");
  check("a shared link carries a title and description",
    /openGraph:/.test(layout) && /twitter:/.test(layout));
  check("and an image to unfurl", existsSync("apps/web/app/opengraph-image.tsx"));
}

// The way on. A dead lift takes one floor, and only after the player has found
// what is waiting at the end of floor zero.
{
  reset();
  store().setTrapped();
  check("a trapped lift takes nowhere at first", store().offered === null);

  store().offer(-1);
  check("something found makes it take one floor", store().offered === -1);

  // Never back up, and never two at once: the hotel chooses, always downward.
  store().offer(0);
  check("it will not be talked upward", store().offered === -1, "0 refused");
  store().offer(5);
  check("nor back to the player's own floor", store().offered === -1);
  store().offer(-2);
  check("but it will go further down", store().offered === -2);
}

// The panel is dead until a page opens something.
{
  const { readFileSync } = await import("node:fs");
  const lift = readFileSync("apps/web/components/environment/Elevator.tsx", "utf8");
  check("the dead panel refuses everything but that floor",
    /if \(trapped && floor !== offered\)/.test(lift));
  // The layout is data now, so this asks the layout rather than the JSX.
  const { panelButtons } = await import("../game/data/panel");
  const { ELEVATOR_CONFIG } = await import("../game/systems/elevator");
  const before = panelButtons(ELEVATOR_CONFIG.servedFloors, true, null);
  const after = panelButtons(ELEVATOR_CONFIG.servedFloors, true, -1);
  check("and grows a button for it that was not there before",
    !before.some((row) => row.kind === "offered")
      && after.some((row) => row.kind === "offered" && row.floor === -1));
}

// A floor under the building carries the numbers of the player's own, which is
// worse than a number that makes no sense.
{
  const { generateFloor } = await import("../game/generation/generateFloor");
  const below = generateFloor(-1);
  const own = generateFloor(5);
  check("floors below the ground repeat the fifth's numbers",
    JSON.stringify(below.rooms.map((r) => r.number)) === JSON.stringify(own.rooms.map((r) => r.number)),
    below.rooms.slice(0, 3).map((r) => r.number).join(", "));
  check("and none of them is a negative number",
    below.rooms.every((r) => r.number > 0));
  // It still has to be a floor a player can walk.
  check("it is still a working floor",
    below.rooms.length === 8 && below.corridorFrom < below.corridorTo);
}

// The descent below the hotel. Each floor holds one page, the page opens the
// next, and the last one opens nothing.
{
  const { generateFloor } = await import("../game/generation/generateFloor");
  const { buildFloor } = await import("../game/data/floor");

  // The page at the end of the corridor, not the notice on the room's desk.
  const page = (floor: number) =>
    buildFloor(generateFloor(floor)).notes.find((n) => n.id.startsWith("floor-"));

  // Walk it the way the player does: read what is here, press what it opens.
  const chain = [0];
  for (let step = 0; step < 12; step += 1) {
    const floor = chain[chain.length - 1] as number;
    const found = page(floor);
    // The end of the walk is a floor with nothing left to read on it.
    if (!found?.opens) break;
    check(`floor ${floor} opens the one below it`, found.opens === floor - 1,
      `opens ${found.opens}`);
    chain.push(found.opens);
  }
  check("the descent runs from the ground floor to the bottom", chain.length >= 5,
    `floors ${chain.join(", ")}`);
  check("and stops where there is nothing further to read",
    page(chain[chain.length - 1] as number)?.opens === undefined,
    `floor ${chain[chain.length - 1]} is the end`);

  // A page in the dark is a page that is not there. This floor has no doors
  // and no numbers, so the page is the only thing on it, and if it cannot be
  // seen the run stops on floor zero.
  let unlit = "";
  for (const floor of chain) {
    const spec = generateFloor(floor);
    const found = page(floor);
    if (!found) continue;
    const nearest = Math.min(...spec.lamps
      .filter((lamp) => lamp.lit)
      .map((lamp) => Math.abs(lamp.z - found.position[2])));
    if (nearest > 1.5) unlit += ` floor ${floor} is ${nearest.toFixed(1)}m from a light;`;
  }
  check("every page lies in a pool of light", unlit === "", unlit || "on all of them");

  // Every floor of it has to be reachable by the lift, or the chain stops
  // somewhere the player cannot follow.
  const { ELEVATOR_CONFIG, isServed } = await import("../game/systems/elevator");
  const unreachable = chain.filter((f) => !isServed(f, ELEVATOR_CONFIG));
  check("the lift can reach every floor the pages open", unreachable.length === 0,
    unreachable.join(", ") || `${chain.length} floors`);
  check("and no further than the last of them",
    !isServed(Math.min(...chain) - 1, ELEVATOR_CONFIG),
    "so the panel never advertises how deep this goes");
  // It has to end on G. Ending anywhere else leaves the player on a floor with
  // no page to read and no button to press.
  const { G_FLOOR } = await import("../game/systems/elevator");
  check("the descent ends at G", chain[chain.length - 1] === G_FLOOR,
    `ends on ${chain[chain.length - 1]}`);
  // G is the fifth floor: nine floors down, the doors open on the corridor the
  // player started in, with nothing wrong with it.
  const g = generateFloor(G_FLOOR);
  const home = generateFloor(5);
  check("and G is the floor the player started on",
    JSON.stringify(g.rooms) === JSON.stringify(home.rooms) && g.anomaly === null);

  // Reaching it with the doors open is what ends the run.
  const { readFileSync } = await import("node:fs");
  const lift = readFileSync("apps/web/components/environment/Elevator.tsx", "utf8");
  check("arriving at G ends the game",
    /state\.phase === "open" && state\.floor === G_FLOOR/.test(lift));
  check("and the ending is a phase, not a screen the player can pause out of",
    /phase === "playing" \|\| phase === "ending"/.test(
      readFileSync("apps/web/components/ui/Overlay.tsx", "utf8")));

  // A page opens a floor by saying so, not by its name.
  check("a page opens a floor by carrying it",
    /spec\.opens !== undefined\) offer\(spec\.opens\)/.test(
      readFileSync("apps/web/components/environment/Note.tsx", "utf8")));
}

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
